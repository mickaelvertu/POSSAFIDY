export const PRESENTATION_CRITERIA = ["Tenue propre et adaptée", "Uniforme et badge (si requis)", "Hygiène respectée", "Poste propre et rangé"];
export type Finding = { result: "OK" | "ISSUE" | "NA"; note: string; photo: string };
export interface PresentationCheck {
  id: string; store_id: string; employee_id: string; employee_name: string;
  created_by: string; created_by_name: string; created_at: number; updated_at: number;
  status: "DRAFT" | "SUBMITTED" | "VALIDATED" | "CORRECTION";
  findings: Finding[]; review_note: string; reviewed_by: string; reviewed_at: number;
}
export function presentationScore(findings: Finding[]) {
  return { points: findings.filter(f => f.result === "OK").length * 5, maximum: findings.filter(f => f.result !== "NA").length * 5 };
}
export function validateFindings(findings: Finding[]) {
  if (findings.length !== 4 || findings.some(f => !["OK", "ISSUE", "NA"].includes(f.result))) throw new Error("Grille de contrôle invalide.");
  if (findings.every(f => f.result === "NA")) throw new Error("Au moins un critère doit être applicable.");
  if (findings.some(f => f.note.length > 4000 || f.photo.length > 2000)) throw new Error("Observation ou lien photo trop long.");
  if (findings.some(f => f.result === "ISSUE" && f.note.trim().length < 5)) throw new Error("Justifiez chaque anomalie (5 caractères minimum).");
  if (findings.some(f => f.photo && !/^https:\/\//i.test(f.photo))) throw new Error("Les liens photo doivent commencer par https://.");
}
