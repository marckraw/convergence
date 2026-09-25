/** Vite's `?raw` import: the file's text, bundled as a string. */
declare module '*.txt?raw' {
  const text: string
  export default text
}
