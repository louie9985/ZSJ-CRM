import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), keycloakify({ accountThemeImplementation: "none" })]
});
