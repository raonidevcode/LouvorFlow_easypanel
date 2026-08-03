import { hashPassword } from "../authCrypto";

async function main() {
  var password = process.env.LOUVORFLOW_PASSWORD || "";

  if (!password) {
    console.error("Informe a senha em LOUVORFLOW_PASSWORD.");
    process.exit(1);
  }

  console.log(await hashPassword(password));
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
