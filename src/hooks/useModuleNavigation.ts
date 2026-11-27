import { useEffect, useState } from "react";

const modules = [
  "home", "sales", "stocks", "transfers", "rawMaterialOrders", "productionOrders",
  "posOrders", "stores", "catalog", "production", "procurement", "expenses", "treasury",
  "cashHandovers", "units", "staff", "payroll", "reports", "audit", "credit",
  "resellerPortal", "inventory", "employeePresentation", "overview",
] as const;

type AppModule = (typeof modules)[number];
const addressableModules: readonly AppModule[] = ["home", "sales", "stocks", "transfers"];
const overviewHash = "#/vue-ensemble";

function moduleFromLocation(fallback: AppModule): AppModule {
  if (window.location.hash === overviewHash) return "overview";
  const route = window.location.hash.slice(2);
  return addressableModules.find(module => module === route && window.location.hash.startsWith("#/")) ?? fallback;
}

export function useModuleNavigation(fallback: AppModule) {
  const [activeModule, setModule] = useState(() => moduleFromLocation(fallback));
  useEffect(() => {
    const restoreModule = () => setModule(moduleFromLocation(fallback));
    window.addEventListener("hashchange", restoreModule);
    window.addEventListener("popstate", restoreModule);
    restoreModule();
    return () => {
      window.removeEventListener("hashchange", restoreModule);
      window.removeEventListener("popstate", restoreModule);
    };
  }, [fallback]);

  const navigate = (module: AppModule) => {
    const hash = module === "overview" ? overviewHash : addressableModules.includes(module) ? `#/${module}` : "";
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", window.location.pathname + window.location.search + hash);
    }
    setModule(module);
  };
  return [activeModule, navigate] as const;
}
