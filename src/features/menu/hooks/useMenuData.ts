import { useCallback, useEffect, useState } from "react";
import type { Category, Restaurant } from "../../../../shared/types";

interface MenuDataState {
  restaurant: Restaurant | null;
  menu: Category[];
  loading: boolean;
  loadError: string;
}

export function useMenuData(slug: string | undefined): MenuDataState & {
  reload: () => void;
} {
  const [state, setState] = useState<MenuDataState>({
    restaurant: null,
    menu: [],
    loading: true,
    loadError: "",
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!slug) {
        setState({ restaurant: null, menu: [], loading: false, loadError: "" });
        return;
      }

      setState((current) => ({ ...current, loading: true, loadError: "" }));
      try {
        const source = new URLSearchParams(window.location.search).get("source");
        const sourceQuery = source === "qr" ? "?source=qr" : "";
        const response = await fetch(
          "/api/public-menu/" + slug + sourceQuery,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Menu request failed.");

        const data = (await response.json()) as {
          restaurant?: Restaurant;
          menu?: Category[];
        };
        if (controller.signal.aborted) return;
        setState({
          restaurant: data.restaurant ?? null,
          menu: data.menu ?? [],
          loading: false,
          loadError: "",
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Error fetching data:", error);
        if (!controller.signal.aborted) {
          setState({
            restaurant: null,
            menu: [],
            loading: false,
            loadError: "Could not load this menu. Please try again.",
          });
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [slug, reloadToken]);

  return { ...state, reload };
}
