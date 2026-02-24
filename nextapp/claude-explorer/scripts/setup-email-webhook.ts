/**
 * One-off script to register a webhook endpoint + email address in inbound.new
 * for the claude-explorer project.
 *
 * Usage:
 *   INBOUND_EMAIL_API_KEY=<key> bun scripts/setup-email-webhook.ts
 */
import Inbound from "inboundemail";

const WEBHOOK_URL =
  "https://claude-explorer-v2-production.up.railway.app/api/email/inbound";
const DOMAIN = "yoda.fun";
const EMAIL_LOCAL = "explorer";
const ENDPOINT_NAME = process.env.INSTANCE_NAME ?? "claude-explorer";

async function main() {
  const apiKey = process.env.INBOUND_EMAIL_API_KEY;
  if (!apiKey) {
    console.error("Missing INBOUND_EMAIL_API_KEY env var");
    process.exit(1);
  }

  const inbound = new Inbound({ apiKey });

  // 1. Find yoda.fun domain
  console.log("Listing domains...");
  const domains = await inbound.domains.list();
  const yodaDomain = domains.data.find((d) => d.domain === DOMAIN);
  if (!yodaDomain) {
    console.error(
      `Domain "${DOMAIN}" not found. Available:`,
      domains.data.map((d) => d.domain)
    );
    process.exit(1);
  }
  console.log(`Found domain: ${yodaDomain.domain} (${yodaDomain.id})`);

  // 2. Check if endpoint already exists
  const existingEndpoints = await inbound.endpoints.list({
    search: ENDPOINT_NAME,
  });
  const existing = existingEndpoints.data.find((e) => e.name === ENDPOINT_NAME);
  let endpointId: string;

  if (existing) {
    console.log(
      `Endpoint "${ENDPOINT_NAME}" already exists (${existing.id}), updating URL...`
    );
    await inbound.endpoints.update(existing.id, {
      config: { url: WEBHOOK_URL },
    });
    endpointId = existing.id;
  } else {
    console.log("Creating webhook endpoint...");
    const endpoint = await inbound.endpoints.create({
      name: ENDPOINT_NAME,
      type: "webhook",
      config: { url: WEBHOOK_URL },
    });
    endpointId = endpoint.id;
    console.log(`Created endpoint: ${endpoint.name} (${endpoint.id})`);
  }

  // 3. Check if email address already exists
  // NOTE: SDK docs say local part only, but API requires full address (explorer@yoda.fun)
  const fullAddress = `${EMAIL_LOCAL}@${DOMAIN}`;
  const existingEmails = await inbound.emailAddresses.list({
    domainId: yodaDomain.id,
  });
  const existingEmail = existingEmails.data.find(
    (e) => e.address === fullAddress
  );

  if (existingEmail) {
    console.log(
      `Email "${fullAddress}" already exists (${existingEmail.id}), updating routing...`
    );
    await inbound.emailAddresses.update(existingEmail.id, {
      endpointId,
    });
  } else {
    console.log(`Creating email address ${fullAddress}...`);
    const emailAddr = await inbound.emailAddresses.create({
      address: fullAddress,
      domainId: yodaDomain.id,
      endpointId,
    });
    console.log(`Created email: ${emailAddr.address} (${emailAddr.id})`);
  }

  // 4. Test the endpoint
  console.log("Testing endpoint...");
  const testResult = await inbound.endpoints.test(endpointId, {
    webhookFormat: "inbound",
  });
  console.log("Test result:", testResult);

  console.log(`\nDone! ${EMAIL_LOCAL}@${DOMAIN} → ${WEBHOOK_URL}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
