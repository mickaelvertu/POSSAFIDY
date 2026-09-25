import { useState, useRef, useEffect, MouseEvent } from "react";
import { Product, PRODUCTS } from "../products";
import { Search, ChevronDown, X } from "lucide-react";

interface SearchableDropdownProps {
  selectedProduct: Product | null;
  onSelect: (product: Product | null) => void;
  placeholder?: string;
  id?: string;
}

export default function SearchableDropdown({
  selectedProduct,
  onSelect,
  placeholder = "Rechercher un produit...",
  id
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedProduct) {
      setSearchQuery(`${selectedProduct.ref} - ${selectedProduct.name}`);
    } else {
      setSearchQuery("");
    }
  }, [selectedProduct]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          setSearchQuery(`${selectedProduct.ref} - ${selectedProduct.name}`);
        } else {
          setSearchQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  const filteredProducts = PRODUCTS.filter((product) => {
    const query = searchQuery.toLowerCase();
    return (
      product.ref.toLowerCase().includes(query) ||
      product.name.toLowerCase().includes(query)
    );
  });

  const handleSelect = (product: Product) => {
    onSelect(product);
    setSearchQuery(`${product.ref} - ${product.name}`);
    setIsOpen(false);
  };

  const handleClear = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full" id={id}>
      <div
        className="flex items-center justify-between w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 transition-all cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400 p-0 focus:ring-0"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedProduct && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <button
                key={product.ref}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-colors ${
                  selectedProduct?.ref === product.ref ? "bg-indigo-50/60 font-semibold text-indigo-600" : "text-slate-700"
                }`}
                onClick={() => handleSelect(product)}
              >
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-indigo-500 font-medium">
                    {product.ref}
                  </span>
                  <span className="text-sm font-sans font-medium text-slate-900">
                    {product.name}
                  </span>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div className="font-medium text-slate-700">{product.prixPublic.toLocaleString("fr-FR")} Ar (Pub)</div>
                  <div className="text-[10px] text-slate-400">{product.prixRevendeur.toLocaleString("fr-FR")} Ar (Rev)</div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-400 italic">
              Aucun produit trouvé
            </div>
          )}
        </div>
      )}
    </div>
  );
}
