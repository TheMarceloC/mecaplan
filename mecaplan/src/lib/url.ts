/** Completa un enlace pegado sin protocolo: "tienda.com/x" → "https://tienda.com/x". */
export const withProtocol = (url: string) => {
  const value = url.trim();
  return !value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : "https://" + value;
};
