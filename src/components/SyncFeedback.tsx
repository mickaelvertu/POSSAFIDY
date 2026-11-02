import { useEffect, useState } from "react";
import FeedbackState from "./FeedbackState";
export default function SyncFeedback({ online, status }: { online: boolean; status: Record<string, string> }) {
 const pending = Object.values(status).some(value => value === "loading" || value === "cached");
 const [slow, setSlow] = useState(false);
 useEffect(() => {
 setSlow(false);
 if (!online || !pending) return;
 const timer = window.setTimeout(() => setSlow(true), 10000);
 return () => window.clearTimeout(timer);
 }, [online, pending]);
 if (!online) return <FeedbackState kind="offline" title="Aucune connexion Internet" description="Les données en cache peuvent être incomplètes. Les opérations nécessitant Internet restent indisponibles. La synchronisation reprendra au retour de la connexion." />;
 if (pending) return <FeedbackState kind={slow ? "slow" : "loading"} title={slow ? "Le serveur met du temps à répondre" : "Synchronisation en cours"} description={slow ? "La connexion peut être lente. Patientez : les données affichées ne sont pas encore toutes confirmées par le serveur." : "Les données en cache restent affichées pendant la vérification."} />;
 if (Object.keys(status).length && Object.values(status).every(value => value === "ready")) return <FeedbackState kind="success" title="Données synchronisées" />;
 return null;
}
