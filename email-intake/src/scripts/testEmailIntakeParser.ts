import { parseEmailIntake } from "../services/emailIntakeParser";

const clean = {
  fromName: "Alex Rivera",
  fromEmail: "alex@example.com",
  subject: "Quote for event tees",
  body: `Hi Cheeky,
We need 24 Gildan soft-style tees, DTG front logo only.
Budget around $450 total.
Call me at 919-555-0142 if questions.
Thanks,
Alex`,
};

const messyPrint = {
  fromName: "Jordan Lee",
  fromEmail: "jordan@startup.io",
  subject: "Hoodies for team",
  body: `Need 36 hoodies with our logo on the back. No rush.
Can you ship to 27601?`,
};

const vague = {
  fromName: "",
  fromEmail: "someone@client.org",
  subject: "company picnic",
  body: "hey can you do something for our event thanks",
};

async function main() {
  for (const [label, payload] of [
    ["1_clean", clean],
    ["2_messy_missing_print", messyPrint],
    ["3_vague_manual_review", vague],
  ] as const) {
    const parsed = parseEmailIntake(payload);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(parsed, null, 2));
  }
}

main();
