-- Création de la table ProjectMember

CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- Index utilisateur

CREATE INDEX "ProjectMember_userId_idx"
ON "ProjectMember"("userId");

-- Un utilisateur ne peut être affecté qu'une seule fois
-- au même chantier.

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key"
ON "ProjectMember"("projectId", "userId");

-- Relations

ALTER TABLE "ProjectMember"
ADD CONSTRAINT "ProjectMember_projectId_fkey"
FOREIGN KEY ("projectId")
REFERENCES "Project"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
ADD CONSTRAINT "ProjectMember_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Reprise des accès historiques :
-- tous les chefs et clients existants conservent
-- l'accès à tous les chantiers existants.

INSERT INTO "ProjectMember" ("id", "projectId", "userId")
SELECT
    'pm_' || md5(p."id" || u."id"),
    p."id",
    u."id"
FROM "Project" p
CROSS JOIN "User" u
WHERE u."role" IN ('CHEF_CFO', 'CHEF_CFA', 'CLIENT')
ON CONFLICT ("projectId", "userId") DO NOTHING;