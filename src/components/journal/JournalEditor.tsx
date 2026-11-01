"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { BulletListIcon, NumberedListIcon } from "@/components/ui/ListIcons";
import { uploadJournalPicture } from "@/app/journal/actions";
import { shrinkImage } from "@/lib/shrink-image";

// Pictures remember their file name (data-path) so the saved entry can find them again later.
const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-path"),
        renderHTML: (attrs: { path?: string | null }) => (attrs.path ? { "data-path": attrs.path } : {}),
      },
    };
  },
});

const EMOJIS = "😀 😂 🥲 😭 😊 😍 🥰 😎 🤔 😴 😤 😡 😳 🥺 😬 🙃 👀 🙏 👍 👎 💀 🔥 ✨ 💯 ❤️ 💔 🎉 🍕 ☕ 🌙 🌧️ ☀️".split(" ");

const imagesIn = (files: FileList | null | undefined) =>
  Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));

// The big writing box: bold / italic / underline, lists (type "- " or "1. " to start one), emoji, and pictures that sit right in the text.
// Fills whatever height it's given and scrolls inside itself.
export default function JournalEditor({
  initial,
  onChange,
  onStatus,
  autoFocus,
  placeholder = "Hello unsus...",
}: {
  initial: string; // HTML
  onChange: (html: string) => void;
  onStatus: (text: string | null) => void; // e.g. "Uploading picture…"
  autoFocus?: boolean;
  placeholder?: string;
}) {
  // Always call the latest callbacks (the editor is only set up once).
  const latest = useRef({ onChange, onStatus });
  useEffect(() => {
    latest.current = { onChange, onStatus };
  });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        strike: false,
      }),
      Picture.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: initial,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "journal-text min-h-full px-4 py-3.5 leading-relaxed text-ink",
        style: "outline: none",
        "aria-label": "Journal entry",
      },
      handlePaste: (_view, event) => {
        const files = imagesIn(event.clipboardData?.files);
        if (files.length === 0) return false;
        addPictures(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = imagesIn((event as DragEvent).dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        addPictures(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => latest.current.onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Upload each picture, then drop it in where the cursor is.
  async function addPictures(files: File[]) {
    for (const file of files) {
      latest.current.onStatus("Uploading picture…");
      const form = new FormData();
      form.append("file", await shrinkImage(file));
      const res = await uploadJournalPicture(form);
      if ("error" in res) {
        latest.current.onStatus(res.error);
        return;
      }
      // Picture, then a fresh line after it with the cursor in it (so typing doesn't replace the picture).
      editorRef.current
        ?.chain()
        .focus()
        .insertContent([{ type: "image", attrs: { src: res.url, path: res.path } }, { type: "paragraph" }])
        .run();
    }
    latest.current.onStatus(null);
  }
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            bullets: e.isActive("bulletList"),
            numbers: e.isActive("orderedList"),
          }
        : null,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-control border-[1.5px] border-line bg-paper transition-colors focus-within:border-ink">
      {/* Toolbar */}
      <div className="relative flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1">
        <ToolButton label="Bold (Ctrl/Cmd+B)" on={active?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton label="Italic (Ctrl/Cmd+I)" on={active?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <span className="font-serif italic">I</span>
        </ToolButton>
        <ToolButton label="Underline (Ctrl/Cmd+U)" on={active?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <span className="underline underline-offset-2">U</span>
        </ToolButton>
        <span className="mx-1 h-4 w-px self-center bg-line" aria-hidden="true" />
        <ToolButton label="Bulleted list (or type - and a space)" on={active?.bullets} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <BulletListIcon />
        </ToolButton>
        <ToolButton label="Numbered list (or type 1. and a space)" on={active?.numbers} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <NumberedListIcon />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <ToolButton label="Emoji" on={emojiOpen} onClick={() => setEmojiOpen((o) => !o)}>
          <span className="text-[15px] leading-none">☺</span>
        </ToolButton>
        <ToolButton label="Add picture" onClick={() => fileRef.current?.click()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="9" cy="10" r="1.8" fill="currentColor" />
            <path d="M4 18l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            addPictures(imagesIn(e.target.files));
            e.target.value = "";
          }}
        />

        {emojiOpen && (
          <div className="absolute left-1.5 top-full z-20 mt-1 w-64 rounded-card border border-line bg-paper p-2 shadow-xl shadow-ink/10">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor?.chain().focus().insertContent(em).run();
                    setEmojiOpen(false);
                  }}
                  className="grid size-7 place-items-center rounded-md text-lg hover:bg-surface"
                >
                  {em}
                </button>
              ))}
            </div>
            <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted">
              All emojis: Win + . (Windows) or Ctrl + Cmd + Space (Mac)
            </p>
          </div>
        )}
      </div>

      {/* The writing area. Clicking empty space below the text puts the cursor at the end. */}
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor?.commands.focus("end");
          }
        }}
      >
        {editor ? <EditorContent editor={editor} className="h-full" /> : null}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : Boolean(on)}
      onMouseDown={(e) => e.preventDefault()} // keep the cursor in the text
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md text-sm transition-colors ${
        on ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
