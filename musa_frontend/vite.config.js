import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "C:/Users/MusaPalermo/Desktop/musa/musa_backend/src/dist",
    emptyOutDir: true, // Vacía la carpeta de salida aunque esté fuera del proyecto
  },
});
