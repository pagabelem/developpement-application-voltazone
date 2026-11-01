import { revalidatePath } from "next/cache";

// Invalide toutes les pages : une modification est visible partout, sans cache périmé
export const refreshAll = () => revalidatePath("/", "layout");