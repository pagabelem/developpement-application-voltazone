import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin, isManager } from "@/lib/auth/permissions";
import { gridStats } from "@/lib/grid";
import { addLevel, addSystem, createUser, generateGrid, setAggregation, toggleUser } from "@/lib/actions/admin";
import { deleteLevel, deleteSystem, deleteUser } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { LotBadge, PageTitle, btn, btnLight, card, input } from "@/components/ui";

const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-xs text-slate-600">{label}{children}</label>;

export default async function ParametresPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!isManager(user)) redirect("/dashboard");
  const admin = isAdmin(user);
  const project = await currentProject();
  const [levels, systems, users, stats] = await Promise.all([
    prisma.level.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } }),
    prisma.system.findMany({ where: { projectId: project.id }, orderBy: [{ lot: "asc" }, { order: "asc" }] }),
    admin ? prisma.user.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    gridStats(project.id),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <PageTitle>Paramètres</PageTitle>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Méthode d'avancement (RG-05)</h2>
        <form action={setAggregation} className="flex gap-2">
          <select name="aggregation" defaultValue={project.aggregation} className={input}>
            <option value="MOYENNE">Moyenne pondérée des lignes</option>
            <option value="SOMME">Somme des quantités (comme Excel)</option>
          </select>
          <button className={btn}>Enregistrer</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Niveaux</h2>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {levels.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded border px-2 py-1">
              {l.label}
              {admin && <DeleteDialog action={deleteLevel} fields={{ id: l.id }} label="Suppr." title={`Supprimer le niveau « ${l.label} » ?`} message="Les lignes de grille de ce niveau seront supprimées définitivement." />}
            </li>
          ))}
        </ul>
        <form action={addLevel} className="flex flex-wrap items-end gap-2">
          <L label="Nom du niveau"><input name="label" placeholder="Ex. Étage 2" required className={input} /></L>
          <L label="Ordre d'affichage"><input name="order" type="number" defaultValue={levels.length + 1} className={`${input} w-24`} /></L>
          <button className={btnLight}>Ajouter</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Systèmes</h2>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {systems.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded border px-2 py-1">
              <LotBadge lot={s.lot} />{s.name} ({s.defaultUnit}){!s.gridEnabled && <span className="text-xs text-slate-400">tâches seulement</span>}
              {admin && <DeleteDialog action={deleteSystem} fields={{ id: s.id }} label="Suppr." title={`Supprimer le système « ${s.name} » ?`} message="Les lignes de grille de ce système seront supprimées ; les tâches liées perdront leur système." />}
            </li>
          ))}
        </ul>
        <form action={addSystem} className="flex flex-wrap items-end gap-2">
          <L label="Lot"><select name="lot" className={input}><option>CFO</option><option>CFA</option></select></L>
          <L label="Nom du système"><input name="name" placeholder="Ex. Éclairage" required className={input} /></L>
          <L label="Unité"><input name="defaultUnit" defaultValue="u" placeholder="m, u…" className={`${input} w-20`} /></L>
          <L label="Ordre d'affichage"><input name="order" type="number" defaultValue={systems.length + 1} className={`${input} w-24`} /></L>
          <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="gridEnabled" defaultChecked />Dans la grille plan / site</label>
          <button className={btnLight}>Ajouter</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">Grille de suivi</h2>
        {sp.grid != null && <div className="mb-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{Number(sp.grid)} ligne(s) créée(s).</div>}
        <p className="text-sm text-slate-600">
          Ce bouton crée, pour chaque combinaison <b>zone × niveau × système de grille</b>, la ligne de suivi qui n'existe pas encore (quantités vides).
          Il ne modifie ni ne supprime jamais une ligne existante. La création est déjà automatique quand vous ajoutez une zone, un niveau ou un système ; ce bouton sert de vérification.
        </p>
        <p className="my-2 rounded bg-slate-50 p-2 text-sm">
          Aujourd'hui : {stats.zones} zone(s) × {stats.levels} niveau(x) × {stats.systems} système(s) = <b>{stats.expected}</b> lignes attendues · <b>{stats.existing}</b> existantes · <b>{Math.max(0, stats.expected - stats.existing)}</b> à créer.
        </p>
        <form action={generateGrid}><button className={btn}>Générer / compléter la grille</button></form>
      </section>

      {admin && (
        <section className={card}>
          <h2 className="mb-2 font-semibold">Utilisateurs</h2>
          <ul className="mb-3 divide-y text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className={u.active ? "" : "text-slate-400 line-through"}>{u.name} — {u.email} — {u.role}</span>
                <span className="flex items-center gap-3">
                  <form action={toggleUser}><input type="hidden" name="id" value={u.id} /><button className="text-xs underline">{u.active ? "Désactiver" : "Réactiver"}</button></form>
                  {u.id !== user.id && <DeleteDialog action={deleteUser} fields={{ id: u.id }} label="Supprimer" title={`Supprimer ${u.name} ?`} message="Ses saisies et blocages seront rattachés à votre compte." />}
                </span>
              </li>
            ))}
          </ul>
          <form action={createUser} className="grid gap-2 md:grid-cols-2">
            <L label="Nom"><input name="name" required className={input} /></L>
            <L label="E-mail"><input name="email" type="email" required className={input} /></L>
            <L label="Mot de passe (8 caractères min.)"><input name="password" type="password" minLength={8} required className={input} /></L>
            <L label="Rôle"><select name="role" className={input}><option value="CHEF_CFO">Chef d'équipe CFO</option><option value="CHEF_CFA">Chef d'équipe CFA</option><option value="CONDUCTEUR">Conducteur</option><option value="CLIENT">Client / MOA</option><option value="ADMIN">Administrateur</option></select></L>
            <div><button className={btn}>Créer l'utilisateur</button></div>
          </form>
        </section>
      )}
    </div>
  );
}