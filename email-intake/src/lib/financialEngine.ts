const MIN_MARGIN_RATIO = 0.45;
const MIN_PPH = 50;
const MIN_INVOICE = 250;
const QUANTITY_MIN_DTG_DTF_EMB = 12;
const QUANTITY_MIN_SCREEN = 24;
const DEPOSIT_RATE = 0.5;
const DEPOSIT_ROUND = 25;

export function calculateMargin(revenue: number, cost: number): number {
  if (revenue <= 0) return Number.NaN;
  return (revenue - cost) / revenue;
}

export function calculatePPH(profit: number, laborHours: number): number {
  if (laborHours <= 0) return Number.NaN;
  return profit / laborHours;
}

export function enforceInvoiceFloor(
  revenue: number
): { valid: true } | { valid: false; reason: string } {
  if (revenue < MIN_INVOICE) {
    return { valid: false, reason: "Below minimum invoice" };
  }
  return { valid: true };
}

export function validateMinimumQuantity(
  quantity: number,
  method: string
): { valid: boolean; reason?: string } {
  const m = method.trim().toUpperCase();
  if (m === "DTG" || m === "DTF" || m === "EMB") {
    if (quantity < QUANTITY_MIN_DTG_DTF_EMB) {
      return {
        valid: false,
        reason: "Quantity below minimum for DTG, DTF, or embroidery",
      };
    }
  } else if (m === "SCREEN") {
    if (quantity < QUANTITY_MIN_SCREEN) {
      return {
        valid: false,
        reason: "Quantity below minimum for screen print",
      };
    }
  }
  return { valid: true };
}

export function calculateDeposit(revenue: number, blankCost: number): number {
  const baseDeposit = revenue * DEPOSIT_RATE;
  const covering = Math.max(baseDeposit, blankCost);
  return Math.ceil(covering / DEPOSIT_ROUND) * DEPOSIT_ROUND;
}

export interface EvaluateOrderInput {
  revenue: number;
  cost: number;
  laborHours: number;
  quantity: number;
  method: string;
  blankCost: number;
}

export interface EvaluateOrderResult {
  approved: boolean;
  margin: number;
  pph: number;
  depositRequired: number;
  errors: string[];
}

export function evaluateOrder(input: EvaluateOrderInput): EvaluateOrderResult {
  const errors: string[] = [];
  const margin = calculateMargin(input.revenue, input.cost);
  const profit = input.revenue - input.cost;

  if (Number.isNaN(margin) || margin < MIN_MARGIN_RATIO) {
    errors.push("Below minimum margin");
  }

  let pph: number;
  if (input.laborHours <= 0) {
    errors.push("Labor hours must be positive");
    pph = Number.NaN;
  } else {
    pph = calculatePPH(profit, input.laborHours);
    if (Number.isNaN(pph) || pph < MIN_PPH) {
      errors.push("Below minimum profit per labor hour");
    }
  }

  const invoice = enforceInvoiceFloor(input.revenue);
  if (invoice.valid === false) {
    errors.push(invoice.reason);
  }

  const quantityCheck = validateMinimumQuantity(input.quantity, input.method);
  if (!quantityCheck.valid && quantityCheck.reason) {
    errors.push(quantityCheck.reason);
  }

  const depositRequired = calculateDeposit(input.revenue, input.blankCost);

  return {
    approved: errors.length === 0,
    margin,
    pph,
    depositRequired,
    errors,
  };
}
