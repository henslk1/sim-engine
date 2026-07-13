import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import TiptapImage from "@tiptap/extension-image"
import TextAlign from "@tiptap/extension-text-align"
import Placeholder from "@tiptap/extension-placeholder"
import CharacterCount from "@tiptap/extension-character-count"
import TextStyle from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import { cn } from "@/lib/utils"
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Link2, Link2Off, Image, Undo2, Redo2,
  Check, X, Highlighter,
} from "lucide-react"
import { useState, useRef } from "react"
import "./rich-text.css"

type InsertMode = "link" | "image" | null

function ToolBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-[11px] transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
}

export function RichTextEditor({
  defaultContent,
  onChange,
  placeholder = "Write something…",
  limit,
  minHeight = "8rem",
  className,
}: {
  defaultContent?: object | null
  onChange?: (json: object) => void
  placeholder?: string
  limit?: number
  minHeight?: string
  className?: string
}) {
  const [insertMode, setInsertMode] = useState<InsertMode>(null)
  const [insertUrl, setInsertUrl] = useState("")
  const colorInputRef = useRef<HTMLInputElement>(null)
  const highlightInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      TiptapImage.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure(limit != null ? { limit } : {}),
    ],
    content: defaultContent ?? undefined,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  })

  if (!editor) return null

  const charCount = editor.storage.characterCount?.characters?.() ?? 0

  function confirmLink() {
    if (!insertUrl.trim()) {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run()
    } else {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: insertUrl.trim() }).run()
    }
    setInsertMode(null)
    setInsertUrl("")
  }

  function confirmImage() {
    if (insertUrl.trim()) {
      editor!.chain().focus().setImage({ src: insertUrl.trim() }).run()
    }
    setInsertMode(null)
    setInsertUrl("")
  }

  function openLinkInsert() {
    const existing = editor.getAttributes("link").href ?? ""
    setInsertUrl(existing)
    setInsertMode("link")
  }

  return (
    <div
      className={cn("rich-text overflow-hidden rounded-md border border-input bg-background text-sm", className)}
      style={{ "--editor-min-h": minHeight } as React.CSSProperties}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
        {/* History */}
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo2 className="size-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo2 className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Text format */}
        <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Headings */}
        <ToolBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <Heading1 className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <Heading2 className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <Heading3 className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Lists + blocks */}
        <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">
          <ListOrdered className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          <Quote className="size-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Alignment */}
        <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
          <AlignLeft className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
          <AlignCenter className="size-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
          <AlignRight className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Link + Image */}
        <ToolBtn
          active={editor.isActive("link") || insertMode === "link"}
          onClick={editor.isActive("link") ? () => editor.chain().focus().unsetLink().run() : openLinkInsert}
          title={editor.isActive("link") ? "Remove link" : "Insert link"}
        >
          {editor.isActive("link") ? <Link2Off className="size-3.5" /> : <Link2 className="size-3.5" />}
        </ToolBtn>
        <ToolBtn active={insertMode === "image"} onClick={() => setInsertMode((m) => m === "image" ? null : "image")} title="Insert image">
          <Image className="size-3.5" />
        </ToolBtn>

        <Divider />

        {/* Text color */}
        <button
          type="button"
          title="Text color"
          onClick={() => colorInputRef.current?.click()}
          className="relative flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span
            className="text-[11px] font-bold"
            style={{ color: editor.getAttributes("textStyle").color ?? "currentColor" }}
          >
            A
          </span>
          <span
            className="absolute bottom-0.5 left-1 right-1 h-[2.5px] rounded-full"
            style={{ backgroundColor: editor.getAttributes("textStyle").color ?? "var(--foreground)" }}
          />
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </button>

        {/* Highlight color */}
        <button
          type="button"
          title="Highlight"
          onClick={() => highlightInputRef.current?.click()}
          className={cn(
            "relative flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted",
            editor.isActive("highlight") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Highlighter className="size-3.5" />
          <span
            className="absolute bottom-0.5 left-1 right-1 h-[2.5px] rounded-full"
            style={{ backgroundColor: editor.getAttributes("highlight").color ?? "#fef08a" }}
          />
          <input
            ref={highlightInputRef}
            type="color"
            className="sr-only"
            defaultValue="#fef08a"
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
        </button>
      </div>

      {/* Inline insert row */}
      {insertMode && (
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/20 px-2.5 py-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {insertMode === "link" ? "URL:" : "Image URL:"}
          </span>
          <input
            autoFocus
            type="url"
            value={insertUrl}
            onChange={(e) => setInsertUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); insertMode === "link" ? confirmLink() : confirmImage() }
              if (e.key === "Escape") { setInsertMode(null); setInsertUrl("") }
            }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={insertMode === "link" ? confirmLink : confirmImage}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground"
          >
            <Check className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => { setInsertMode(null); setInsertUrl("") }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Editor area */}
      <EditorContent editor={editor} className="px-3 py-2.5" />

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-border px-2.5 py-1">
        <span
          className={cn(
            "text-[10px] tabular-nums text-muted-foreground",
            limit != null && charCount >= limit && "text-destructive",
          )}
        >
          {charCount.toLocaleString()}{limit != null ? ` / ${limit.toLocaleString()}` : ""} characters
        </span>
      </div>
    </div>
  )
}
