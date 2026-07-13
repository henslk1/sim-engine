import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import TiptapImage from "@tiptap/extension-image"
import TextAlign from "@tiptap/extension-text-align"
import TextStyle from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import { cn } from "@/lib/utils"
import "./rich-text.css"

export function RichTextRenderer({
  content,
  className,
}: {
  content: object | null | undefined
  className?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: true }),
      TiptapImage.configure({ inline: false }),
    ],
    content: content ?? undefined,
    editable: false,
  })

  if (!content) return null

  return (
    <div className={cn("rich-text", className)}>
      <EditorContent editor={editor} />
    </div>
  )
}
