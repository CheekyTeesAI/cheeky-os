/**
 * Stub for future Carolina Made / vendor garment API.
 * Does not place live orders unless a real integration is wired.
 */
export type VendorGarmentStubResult = {
  success: false;
  mode: "stub";
  message: string;
};

export async function createVendorGarmentOrder(
  _orderId: string
): Promise<VendorGarmentStubResult> {
  return {
    success: false,
    mode: "stub",
    message: "Vendor API not yet connected.",
  };
}
