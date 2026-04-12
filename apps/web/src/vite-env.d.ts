/// <reference types="vite/client" />

// CSS Modules: importing a *.module.css file yields a classname map.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Ambient typing for the raw vocab.json artifact (generated at content build).
declare module '*/packages/content/dist/vocab.json' {
  const value: { he: string; en: string; pos: string }[];
  export default value;
}
