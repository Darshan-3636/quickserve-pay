import biryani from "@/assets/dish-biryani.jpg";
import dosa from "@/assets/dish-dosa.jpg";
import tandoori from "@/assets/dish-tandoori.jpg";
import paneer from "@/assets/dish-paneer.jpg";
import chole from "@/assets/dish-chole.jpg";
import gulab from "@/assets/dish-gulab.jpg";
import chai from "@/assets/dish-chai.jpg";
import hero from "@/assets/hero-thali.jpg";

const MAP: Record<string, string> = {
  "dish-biryani.jpg": biryani,
  "dish-dosa.jpg": dosa,
  "dish-tandoori.jpg": tandoori,
  "dish-paneer.jpg": paneer,
  "dish-chole.jpg": chole,
  "dish-gulab.jpg": gulab,
  "dish-chai.jpg": chai,
  "hero-thali.jpg": hero,
};

export function resolveDishImage(stored: string | null | undefined): string {
  if (!stored) return hero;
  // Stored values may be just a filename, "/src/assets/<name>", or already a URL.
  if (stored.startsWith("http")) return stored;
  const filename = stored.split("/").pop() || "";
  return MAP[filename] ?? hero;
}

export { hero as heroImage };
