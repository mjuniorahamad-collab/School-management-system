import { Loader2, Pencil, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { PersonAvatar } from "@/components/shared/PersonAvatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { photoDisplayUrl } from "@/lib/photoUrl"
import type { PhotoKind } from "@/types/photos"

interface ProfilePhotoFieldProps {
  kind: PhotoKind
  personId: string
  name: string
  /** Storage key for the current photo (from the record's `photoUrl`); null = none. */
  photoUrl: string | null
  /** When false the field renders as a read-only avatar. */
  canEdit: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  isUploading?: boolean
  isRemoving?: boolean
  className?: string
}

/**
 * Reusable profile-photo widget: shows the current photo (or initials), with
 * upload/replace/remove controls when the actor can edit. Mutations are
 * delegated to the caller's hooks so this stays a presentational component.
 */
export function ProfilePhotoField({
  kind,
  personId,
  name,
  photoUrl,
  canEdit,
  onUpload,
  onRemove,
  isUploading = false,
  isRemoving = false,
  className,
}: ProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const src = photoDisplayUrl(kind, personId, photoUrl)

  return (
    <div className={`flex items-center gap-4 ${className ?? ""}`}>
      {src ? (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label={`View full-size photo of ${name}`}
          className="cursor-zoom-in rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <PersonAvatar name={name} photoUrl={src} className="size-16 text-xl" />
        </button>
      ) : (
        <PersonAvatar name={name} className="size-16 text-xl" />
      )}

      {canEdit && (
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload(file)
              event.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : photoUrl ? (
              <Pencil className="size-4" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {isUploading ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
          </Button>
          {photoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={isRemoving}
              onClick={onRemove}
            >
              {isRemoving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Remove photo
            </Button>
          )}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] p-2 sm:max-w-[min(70vw,56rem)]">
          <DialogTitle className="sr-only">{`${name}'s profile photo`}</DialogTitle>
          <div className="flex max-h-[80vh] items-center justify-center overflow-hidden rounded-lg">
            <img
              src={src ?? undefined}
              alt={name}
              className="max-h-[80vh] w-auto max-w-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}