import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, ActionButton } from "@/components/game/ui"
import { StickyNote, Pencil, Check, X } from "lucide-react"
import { trpc } from "@/lib/trpc"

export function NotesPanel({
  animal,
  animalId,
  readonly = false,
}: {
  animal: AnimalProfile
  animalId: string
  readonly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(animal.notes ?? "")

  const utils = trpc.useUtils()
  const { mutate: updateNotes, isPending } = trpc.animal.updateNotes.useMutation({
    onSuccess: () => {
      utils.animalProfile.get.invalidate({ animalId })
      setEditing(false)
    },
  })

  function handleSave() {
    updateNotes({ animalId, notes: value })
  }

  function handleCancel() {
    setValue(animal.notes ?? "")
    setEditing(false)
  }

  return (
    <Panel
      title="Notes"
      icon={<StickyNote className="size-4 text-muted-foreground" />}
      action={
        !readonly && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-3" />
            Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder="Add notes about this animal…"
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1.5">
            <ActionButton
              variant="soft"
              disabled={isPending}
              className="flex-1 justify-center"
              onClick={handleSave}
            >
              <Check className="size-3.5" />
              Save
            </ActionButton>
            <ActionButton
              variant="soft"
              disabled={isPending}
              className="flex-1 justify-center"
              onClick={handleCancel}
            >
              <X className="size-3.5" />
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : animal.notes ? (
        <p className="whitespace-pre-wrap text-[11px] text-foreground">{animal.notes}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60">No notes added yet.</p>
      )}
    </Panel>
  )
}
