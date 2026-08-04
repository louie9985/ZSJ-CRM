import ReactMarkdown from "react-markdown";

const allowedMarkdown = ["p", "br", "strong", "em", "ul", "ol", "li", "blockquote", "code"];

export function RestrictedMarkdown({ children }: { readonly children: string }): React.JSX.Element {
  return <ReactMarkdown allowedElements={allowedMarkdown} skipHtml>{children}</ReactMarkdown>;
}
