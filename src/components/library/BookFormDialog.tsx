import { useState } from "react"
import type { FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateLibraryBook, useLibraryBook, useUpdateLibraryBook } from "@/hooks/useLibrary"
import { LIBRARY_CATEGORY_LABELS, LIBRARY_CATEGORY_OPTIONS } from "@/types/library"
import type { LibraryBookDetail, LibraryBookListItem } from "@/types/library"
import {
  bookFormToPayload,
  defaultBookForm,
  validateBookForm,
} from "@/lib/libraryFormRules"
import type { BookFormError, BookFormValue } from "@/lib/libraryFormRules"

interface BookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: LibraryBookListItem | null
}

export function BookFormDialog({ open, onOpenChange, editing }: BookFormDialogProps) {
  if (editing) {
    return <EditBookDialog open={open} onOpenChange={onOpenChange} book={editing} />
  }
  return (
    <CreateBookDialog
      key={String(open)}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

function CreateBookDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<BookFormValue>(defaultBookForm)
  const [errors, setErrors] = useState<BookFormError[]>([])
  const createBook = useCreateLibraryBook()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateBookForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    createBook.mutate(bookFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BookFormContent
        title="Add Book"
        description="Add a new title to the library catalogue."
        value={value}
        setValue={setValue}
        errors={errors}
        submit={submit}
        submitLabel={createBook.isPending ? "Saving..." : "Add book"}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  )
}

function EditBookDialog({
  open,
  onOpenChange,
  book,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: LibraryBookListItem
}) {
  const { data: detail, isPending, isError, refetch } = useLibraryBook(book.id)

  const content = (() => {
    if (isPending) {
      return (
        <div className="flex flex-col gap-4 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )
    }
    if (isError || !detail) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load this book.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      )
    }
    return (
      <EditBookInner key={detail.id} book={detail} onOpenChange={onOpenChange} />
    )
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Book</DialogTitle>
          <DialogDescription>Update the bibliographic record for this title.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}

function EditBookInner({
  book,
  onOpenChange,
}: {
  book: LibraryBookDetail
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<BookFormValue>(() => ({
    title: book.title,
    author: book.author,
    isbn: book.isbn ?? "",
    publisher: book.publisher ?? "",
    edition: book.edition ?? "",
    category: book.category,
    language: book.language ?? "",
    description: book.description ?? "",
    coverUrl: book.coverUrl ?? "",
  }))
  const [errors, setErrors] = useState<BookFormError[]>([])
  const updateBook = useUpdateLibraryBook(book.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateBookForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    updateBook.mutate(bookFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <BookFormContent
      title="Edit Book"
      description="Update the bibliographic record for this title."
      value={value}
      setValue={setValue}
      errors={errors}
      submit={submit}
      submitLabel={updateBook.isPending ? "Saving..." : "Save changes"}
      onOpenChange={onOpenChange}
    />
  )
}

function BookFormContent({
  title,
  description,
  value,
  setValue,
  errors,
  submit,
  submitLabel,
  onOpenChange,
}: {
  title: string
  description: string
  value: BookFormValue
  setValue: (value: BookFormValue) => void
  errors: BookFormError[]
  submit: (event: FormEvent) => void
  submitLabel: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-title">Title</Label>
            <Input
              id="book-title"
              value={value.title}
              onChange={(event) => setValue({ ...value, title: event.target.value })}
              placeholder="e.g. To Kill a Mockingbird"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-author">Author</Label>
            <Input
              id="book-author"
              value={value.author}
              onChange={(event) => setValue({ ...value, author: event.target.value })}
              placeholder="e.g. Harper Lee"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-isbn">ISBN</Label>
            <Input
              id="book-isbn"
              value={value.isbn}
              onChange={(event) => setValue({ ...value, isbn: event.target.value })}
              placeholder="e.g. 978-0-06-112008-4"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-publisher">Publisher</Label>
            <Input
              id="book-publisher"
              value={value.publisher}
              onChange={(event) => setValue({ ...value, publisher: event.target.value })}
              placeholder="e.g. J.B. Lippincott"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-edition">Edition</Label>
            <Input
              id="book-edition"
              value={value.edition}
              onChange={(event) => setValue({ ...value, edition: event.target.value })}
              placeholder="e.g. 1st Edition"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-category">Category</Label>
            <Select
              value={value.category}
              onValueChange={(category) => setValue({ ...value, category: category as BookFormValue["category"] })}
            >
              <SelectTrigger id="book-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_CATEGORY_OPTIONS.map((category) => (
                  <SelectItem key={category} value={category}>
                    {LIBRARY_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-language">Language</Label>
            <Input
              id="book-language"
              value={value.language}
              onChange={(event) => setValue({ ...value, language: event.target.value })}
              placeholder="e.g. English"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-description">Description</Label>
            <Textarea
              id="book-description"
              value={value.description}
              onChange={(event) => setValue({ ...value, description: event.target.value })}
              rows={3}
              placeholder="A short summary of the title (optional)."
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-cover">Cover image URL</Label>
            <Input
              id="book-cover"
              type="url"
              value={value.coverUrl}
              onChange={(event) => setValue({ ...value, coverUrl: event.target.value })}
              placeholder="https://… (optional)"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {errors.map((error) => (
              <li key={error.field}>{error.message}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitLabel.startsWith("Saving")}>
              {submitLabel}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </>
  )
}