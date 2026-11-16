const fs = require("fs");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const localEnv = dotenv.parse(fs.readFileSync(".env"));
const remoteEnv = dotenv.parse(fs.readFileSync(".env.production"));

const local = new PrismaClient({
  datasources: { db: { url: localEnv.POSTGRES_PRISMA_URL } }
});

const remote = new PrismaClient({
  datasources: { db: { url: remoteEnv.POSTGRES_PRISMA_URL } }
});

async function inspect(db, label) {
  console.log("\n========== " + label + " ==========");

  for (const model of [
    "user", "project", "team", "zone",
    "workItem", "attachment", "auditLog",
    "dailyReport", "materialRequest"
  ]) {
    const count = await db[model].count();
    console.log(model + " : " + count);
  }

  const attachments = await db.attachment.findMany({
    select: {
      id: true,
      filename: true,
      projectId: true,
      entity: true,
      storagePath: true
    }
  });

  console.log("Pièces jointes :", attachments);
}

async function main() {
  await inspect(local, "BASE LOCALE");
  await inspect(remote, "BASE SUPABASE");
}

main()
  .catch(console.error)
  .finally(async () => {
    await local.$disconnect();
    await remote.$disconnect();
  });
