import { useState, FormEvent } from "react";
import { 
  Article, 
  Category, 
  ArticleTypeCode, 
  UserProfile,
  UnitOfMeasure
} from "../types";
import { 
  Boxes, 
  Plus, 
  Tag, 
  Search, 
  Edit, 
  PowerOff, 
  CheckCircle2, 
  X, 
  Layers, 
  DollarSign,
  FolderPlus
} from "lucide-react";
import DataManagementActions from "./DataManagementActions";
import { createSequentialId } from "../services/idService";

interface CatalogViewProps {
  articles: Article[];
  categories: Category[];
  units: UnitOfMeasure[];
  currentUser: UserProfile;
  visibleArticleTypes: ArticleTypeCode[];
  onCreateArticle: (art: Article) => Promise<void>;
  onUpdateArticle: (art: Article) => Promise<void>;
  onToggleArticleStatus: (articleId: string) => Promise<void>;
  onCreateCategory: (cat: Category) => Promise<void>;
  onToggleCategoryStatus: (categoryId: string) => Promise<void>;
  onImportData: (data: { articles: Article[]; categories: Category[] }) => Promise<void>;
  onResetData: () => Promise<void>;
}

export default function CatalogView({
  articles,
  categories,
  units,
  currentUser,
  visibleArticleTypes,
  onCreateArticle,
  onUpdateArticle,
  onToggleArticleStatus,
  onCreateCategory,
  onToggleCategoryStatus,
  onImportData,
  onResetData
}: CatalogViewProps) {
  const [activeTab, setActiveTab] = useState<"ARTICLES" | "CATEGORIES">("ARTICLES");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<"ALL" | ArticleTypeCode>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Article Modal
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [artCode, setArtCode] = useState("");
  const [artName, setArtName] = useState("");
  const [artCatId, setArtCatId] = useState(categories[0]?.id || "");
  const [artType, setArtType] = useState<ArticleTypeCode>("RESALE");
  const [artUnit, setArtUnit] = useState("");
  const [artPrixAchat, setArtPrixAchat] = useState(0);
  const [artPrixNormal, setArtPrixNormal] = useState(0);
  const [artPrixRevendeur, setArtPrixRevendeur] = useState(0);
  const [artMinStock, setArtMinStock] = useState(10);
  const [articleError, setArticleError] = useState("");
  const [isSavingArticle, setIsSavingArticle] = useState(false);

  // Category Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const handleOpenNewArticle = () => {
    if (visibleArticleTypes.length === 0) return;
    setArticleError("");
    setEditingArticle(null);
    setArtCode("");
    setArtName("");
    setArtCatId(categories[0]?.id || "");
    setArtType(visibleArticleTypes.includes("RESALE") ? "RESALE" : visibleArticleTypes[0]);
    setArtUnit(
      units.find(unit => unit.is_active && unit.name.toLocaleLowerCase("fr-FR") === "unité")?.name ||
      units.find(unit => unit.is_active)?.name ||
      ""
    );
    setArtPrixAchat(0);
    setArtPrixNormal(0);
    setArtPrixRevendeur(0);
    setArtMinStock(10);
    setIsArticleModalOpen(true);
  };

  const handleOpenEditArticle = (art: Article) => {
    setArticleError("");
    setEditingArticle(art);
    setArtCode(art.code);
    setArtName(art.name);
    setArtCatId(art.category_id);
    setArtType(art.article_type);
    setArtUnit(art.unit);
    setArtPrixAchat(art.prix_achat);
    setArtPrixNormal(art.prix_normal);
    setArtPrixRevendeur(art.prix_revendeur);
    setArtMinStock(art.min_alert_stock || 10);
    setIsArticleModalOpen(true);
  };

  const handleSaveArticle = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedCode = artCode.trim().toUpperCase();
    if (!normalizedCode || !artName.trim() || !artCatId) {
      setArticleError("Le code, la désignation et la catégorie sont requis.");
      return;
    }
    if (!visibleArticleTypes.includes(artType)) {
      setArticleError("Vous n'êtes pas autorisé à gérer ce type d'article.");
      return;
    }
    if (articles.some(article => article.id !== editingArticle?.id && article.code.trim().toUpperCase() === normalizedCode)) {
      setArticleError("Ce code article est déjà utilisé.");
      return;
    }

    setIsSavingArticle(true);
    setArticleError("");
    try {
      const timestamp = Date.now();
      if (editingArticle) {
        await onUpdateArticle({
          ...editingArticle,
          code: normalizedCode,
          name: artName.trim(),
          category_id: artCatId,
          article_type: artType,
          unit: artUnit.trim(),
          prix_achat: Number(artPrixAchat),
          prix_normal: Number(artPrixNormal),
          prix_revendeur: Number(artPrixRevendeur),
          min_alert_stock: Number(artMinStock),
          updated_at: timestamp
        });
      } else {
        await onCreateArticle({
          id: await createSequentialId("ART", articles.map(article => article.id)),
          code: normalizedCode,
          name: artName.trim(),
          category_id: artCatId,
          article_type: artType,
          unit: artUnit.trim(),
          prix_achat: Number(artPrixAchat),
          prix_normal: Number(artPrixNormal),
          prix_revendeur: Number(artPrixRevendeur),
          min_alert_stock: Number(artMinStock),
          is_active: true,
          created_at: timestamp,
          updated_at: timestamp
        });
      }
      setIsArticleModalOpen(false);
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : "Impossible d'enregistrer l'article.");
    } finally {
      setIsSavingArticle(false);
    }
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedCode = catCode.trim().toUpperCase();
    if (!normalizedCode || !catName.trim()) {
      setCategoryError("Le code et le nom de la catégorie sont requis.");
      return;
    }
    if (categories.some(category => category.code.trim().toUpperCase() === normalizedCode)) {
      setCategoryError("Ce code catégorie est déjà utilisé.");
      return;
    }

    setIsSavingCategory(true);
    setCategoryError("");
    try {
      const timestamp = Date.now();
      await onCreateCategory({
        id: await createSequentialId("CAT", categories.map(category => category.id)),
        code: normalizedCode,
        name: catName.trim(),
        description: catDesc.trim(),
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp
      });
      setIsCategoryModalOpen(false);
      setCatCode("");
      setCatName("");
      setCatDesc("");
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "Impossible d'enregistrer la catégorie.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleToggleArticleStatus = async (articleId: string) => {
    try {
      await onToggleArticleStatus(articleId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible de modifier le statut de l'article.");
    }
  };

  const handleToggleCategoryStatus = async (categoryId: string) => {
    try {
      await onToggleCategoryStatus(categoryId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible de modifier le statut de la catégorie.");
    }
  };

  const filteredArticles = articles.filter((a) => {
    if (selectedType !== "ALL" && a.article_type !== selectedType) return false;
    if (selectedCategory !== "ALL" && a.category_id !== selectedCategory) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || id;

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Articles, Matières Premières & Catégories
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 1 : Classification RESALE / RAW_MATERIAL. Les articles restent dans l'historique et sont désactivés plutôt que supprimés.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DataManagementActions
            data={{ articles, categories }}
            label="catalogue"
            isAdmin={currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN"}
            onImport={onImportData}
            onReset={onResetData}
          />
          <button
            type="button"
            onClick={() => {
              setCategoryError("");
              setIsCategoryModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-300"
          >
            <FolderPlus className="h-4 w-4" />
            Nouvelle Catégorie
          </button>
          {visibleArticleTypes.length > 0 && <button
            type="button"
            onClick={handleOpenNewArticle}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nouvel Article
          </button>}
        </div>
      </div>

      {/* Tabs Switcher: Articles vs Categories */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("ARTICLES")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === "ARTICLES" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Articles du Catalogue ({articles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CATEGORIES")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === "CATEGORIES" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Catégories Administrables ({categories.length})
        </button>
      </div>

      {/* ARTICLES TAB */}
      {activeTab === "ARTICLES" && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Catégorie :</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">Toutes les Catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
              {visibleArticleTypes.length > 1 && <button
                type="button"
                onClick={() => setSelectedType("ALL")}
                className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"}`}
              >
                Tous
              </button>}
              {visibleArticleTypes.includes("RESALE") && <button
                type="button"
                onClick={() => setSelectedType("RESALE")}
                className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "RESALE" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600"}`}
              >
                RESALE (Revente)
              </button>}
              {visibleArticleTypes.includes("RAW_MATERIAL") && <button
                type="button"
                onClick={() => setSelectedType("RAW_MATERIAL")}
                className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "RAW_MATERIAL" ? "bg-white text-purple-800 shadow-xs" : "text-slate-600"}`}
              >
                RAW_MATERIAL (Matière Première)
              </button>}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher code, nom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Articles Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-3">Réf / Code</th>
                    <th className="py-3 px-3">Désignation</th>
                    <th className="py-3 px-3">Catégorie</th>
                    <th className="py-3 px-3">Classification</th>
                    <th className="py-3 px-3">Conditionnement</th>
                    <th className="py-3 px-3 text-right">Prix Achat</th>
                    <th className="py-3 px-3 text-right">Prix Normal (POS)</th>
                    <th className="py-3 px-3 text-right">Prix Revendeur</th>
                    <th className="py-3 px-3 text-center">Statut</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredArticles.map((art) => (
                    <tr key={art.id} className={`hover:bg-slate-50 ${!art.is_active ? "opacity-60 bg-slate-50/60" : ""}`}>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {art.code}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {art.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {getCategoryName(art.category_id)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          art.article_type === "RESALE" 
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                            : "bg-purple-50 text-purple-800 border border-purple-200"
                        }`}>
                          {art.article_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {art.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {art.prix_achat.toLocaleString("fr-FR")} Ar
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {art.prix_normal.toLocaleString("fr-FR")} Ar
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                        {art.prix_revendeur.toLocaleString("fr-FR")} Ar
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          art.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                        }`}>
                          {art.is_active ? "Actif" : "Désactivé"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditArticle(art)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                            title="Modifier"
                            aria-label={`Modifier l'article ${art.name}`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleArticleStatus(art.id)}
                            className={`p-1 rounded cursor-pointer ${
                              art.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                            title={art.is_active ? "Désactiver (Conserver historique)" : "Réactiver"}
                          >
                            <PowerOff className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES TAB */}
      {activeTab === "CATEGORIES" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {c.code}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                  }`}>
                    {c.is_active ? "Actif" : "Désactivé"}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-3">{c.name}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {c.description || "Aucune description renseignée."}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  {articles.filter(a => a.category_id === c.id).length} articles
                </span>
                <button
                  type="button"
                  onClick={() => void handleToggleCategoryStatus(c.id)}
                  className="text-amber-600 hover:text-amber-800 font-bold"
                >
                  {c.is_active ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ARTICLE CREATE / EDIT MODAL */}
      {isArticleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                {editingArticle ? `Modifier l'Article [${editingArticle.code}]` : "Créer un Nouvel Article"}
              </h3>
              <button
                type="button"
                onClick={() => setIsArticleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="mt-4 space-y-3">
              {articleError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{articleError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Code Réf (Métier) :</label>
                  <input
                    type="text"
                    required
                    value={artCode}
                    onChange={(e) => setArtCode(e.target.value)}
                    placeholder="Ex: HE-RAV-01, B-107..."
                    className="w-full font-mono font-bold text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Classification :</label>
                  <select
                    value={artType}
                    onChange={(e) => setArtType(e.target.value as ArticleTypeCode)}
                    className="w-full text-slate-900 bg-white border border-slate-300 rounded-lg p-2 font-bold"
                  >
                    {visibleArticleTypes.includes("RESALE") && <option value="RESALE">RESALE (Article de Revente)</option>}
                    {visibleArticleTypes.includes("RAW_MATERIAL") && <option value="RAW_MATERIAL">RAW_MATERIAL (Matière Première)</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Désignation complète :</label>
                <input
                  type="text"
                  required
                  value={artName}
                  onChange={(e) => setArtName(e.target.value)}
                  placeholder="Ex: Baume Katrafay 50ml, Huile Essentielle..."
                  className="w-full text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Catégorie :</label>
                  <select
                    value={artCatId}
                    onChange={(e) => setArtCatId(e.target.value)}
                    className="w-full text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Conditionnement / Unité :</label>
                  <select
                    value={artUnit}
                    onChange={(e) => setArtUnit(e.target.value)}
                    required
                    className="w-full text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                  >
                    <option value="" disabled>Sélectionner une unité</option>
                    {units.filter(unit => unit.is_active || unit.name === artUnit).map(unit => (
                      <option key={unit.id} value={unit.name}>{unit.name}{unit.is_active ? "" : " (inactive)"}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing Grids (Section 7) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block mb-2">Grille Tarifaire (Ariary) :</span>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-sans">Prix d'Achat :</label>
                    <input
                      type="number"
                      value={artPrixAchat}
                      onChange={(e) => setArtPrixAchat(Number(e.target.value))}
                      className="w-full text-slate-900 bg-white border border-slate-300 rounded p-1.5 text-right font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-sans">Prix Normal (POS) :</label>
                    <input
                      type="number"
                      value={artPrixNormal}
                      onChange={(e) => setArtPrixNormal(Number(e.target.value))}
                      className="w-full text-blue-900 bg-white border border-slate-300 rounded p-1.5 text-right font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-sans">Prix Revendeur :</label>
                    <input
                      type="number"
                      value={artPrixRevendeur}
                      onChange={(e) => setArtPrixRevendeur(Number(e.target.value))}
                      className="w-full text-amber-800 bg-white border border-slate-300 rounded p-1.5 text-right font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Seuil Alerte Stock Bas :</label>
                <input
                  type="number"
                  value={artMinStock}
                  onChange={(e) => setArtMinStock(Number(e.target.value))}
                  className="w-full font-mono text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsArticleModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingArticle || categories.length === 0}
                  className="px-5 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isSavingArticle ? "Enregistrement..." : "Enregistrer l'Article"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CATEGORY CREATE MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Nouvelle Catégorie</h3>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="mt-3 space-y-3">
              {categoryError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{categoryError}</p>}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Code Catégorie :</label>
                <input
                  type="text"
                  required
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  placeholder="Ex: CAT-HUILES, CAT-ARGILES..."
                  className="w-full font-mono font-bold text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom de la Catégorie :</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Huiles Essentielles Pures..."
                  className="w-full text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description :</label>
                <textarea
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Description détaillée..."
                  className="w-full text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-4 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-60"
                >
                  {isSavingCategory ? "Enregistrement..." : "Créer la Catégorie"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
