import type { FC } from 'react'
import type {
  InteractionFormField,
  InteractionResponse,
} from '@/entities/session'
import { Button, Checkbox, Input, Textarea } from '@convergence/ui'
import { submitterValue } from './request-card.pure'

interface FormRequestFormProps {
  fields: InteractionFormField[]
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

export const FormRequestForm: FC<FormRequestFormProps> = ({
  fields,
  onSubmit,
}) => (
  <form
    className="mt-4 space-y-4"
    onSubmit={(event) => {
      event.preventDefault()
      const decision = submitterValue(event.nativeEvent) ?? 'accept'
      if (decision === 'decline') {
        onSubmit(
          {
            kind: 'form',
            action: 'decline',
            values: {},
          },
          'Declined form request',
        )
        return
      }

      const values = valuesFromForm(fields, new FormData(event.currentTarget))
      onSubmit(
        {
          kind: 'form',
          action: 'accept',
          values,
        },
        formatFormAnswerDisplay(fields, values),
      )
    }}
  >
    {fields.map((field) => (
      <label key={field.id} className="block min-w-0 space-y-1.5">
        <span className="break-words text-xs font-medium text-ink">
          {field.label}
          {field.required ? <span aria-hidden="true"> *</span> : null}
        </span>
        {field.description ? (
          <span className="block text-xs leading-relaxed text-ink-muted">
            {field.description}
          </span>
        ) : null}
        {field.type === 'boolean' ? (
          <Checkbox
            defaultChecked={field.defaultValue === true}
            name={field.id}
          />
        ) : field.multiline ? (
          <Textarea
            defaultValue={
              field.defaultValue === undefined
                ? undefined
                : String(field.defaultValue)
            }
            name={field.id}
            required={field.required}
            rows={6}
          />
        ) : (
          <Input
            size="lg"
            defaultValue={
              field.defaultValue === undefined
                ? undefined
                : String(field.defaultValue)
            }
            name={field.id}
            required={field.required}
            type={field.type === 'number' ? 'number' : 'text'}
          />
        )}
      </label>
    ))}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="decision" value="accept">
        Submit
      </Button>
      <Button
        type="submit"
        name="decision"
        value="decline"
        variant="ghost"
        formNoValidate
      >
        Decline
      </Button>
    </div>
  </form>
)

function valuesFromForm(
  fields: InteractionFormField[],
  formData: FormData,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === 'boolean') {
        return [field.id, formData.get(field.id) === 'on']
      }

      const value = String(formData.get(field.id) ?? '')
      if (field.type === 'number') {
        const parsed = Number(value)
        return [field.id, Number.isFinite(parsed) ? parsed : 0]
      }

      return [field.id, value]
    }),
  )
}

function formatFormAnswerDisplay(
  fields: InteractionFormField[],
  values: Record<string, string | number | boolean>,
): string {
  return fields
    .map((field) => `${field.label}\n${String(values[field.id] ?? '')}`)
    .join('\n\n')
}
