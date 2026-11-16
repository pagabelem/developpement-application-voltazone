const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@supabase/supabase-js");

const localEnv = dotenv.parse(fs.readFileSync(".env"));
const remoteEnv = dotenv.parse(fs.readFileSync(".env.production"));

const localDb = new PrismaClient({
  datasources: {
    db: { url: localEnv.POSTGRES_PRISMA_URL }
  }
});

const remoteDb = new PrismaClient({
  datasources: {
    db: { url: remoteEnv.POSTGRES_PRISMA_URL }
  }
});

const supabase = createClient(
  remoteEnv.SUPABASE_URL,
  remoteEnv.SUPABASE_SECRET_KEY
);

async function main() {
  const bucket = remoteEnv.SUPABASE_STORAGE_BUCKET;

  if (!bucket) throw new Error("Bucket manquant");

  const directory = path.join(process.cwd(), "storage");

  const files = fs.readdirSync(directory)
    .map(name => path.join(directory, name))
    .filter(file => fs.statSync(file).isFile());

  console.log("Fichiers à transférer :", files.length);

  for (const file of files) {
    const id = path.basename(file);

    const attachment = await localDb.attachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      throw new Error("Métadonnées locales absentes : " + id);
    }

    const remoteAttachment = await remoteDb.attachment.findUnique({
      where: { id }
    });

    if (!remoteAttachment) {
      throw new Error("Pièce jointe absente de Supabase : " + id);
    }

    if (remoteAttachment.storagePath) {
      console.log("Déjà transféré :", id);
      continue;
    }

    const storagePath =
      `${attachment.projectId}/${attachment.entity}/${attachment.id}`;

    const buffer = fs.readFileSync(file);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: attachment.mime,
        upsert: false
      });

    if (error) throw error;

    await remoteDb.attachment.update({
      where: { id },
      data: { storagePath }
    });

    console.log("Transféré :", id);
  }

  console.log("\nTRANSFERT TERMINÉ !");
}

main()
  .catch(error => {
    console.error("ERREUR :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await localDb.$disconnect();
    await remoteDb.$disconnect();
  });
