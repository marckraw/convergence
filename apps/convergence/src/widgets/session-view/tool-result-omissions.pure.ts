import type {
  ToolAttachmentOmissionCode,
  ToolAttachmentOmissions,
} from '@/entities/session'

/**
 * Why an image a tool produced is not shown, in plain words, in the order the
 * line reads them (MAR-4274). Each finishes "this image was …" or "is …".
 */
const OMISSION_REASONS: Record<ToolAttachmentOmissionCode, string> = {
  'image-too-large': 'too large',
  'unsupported-mime-type': 'not a supported image type',
  'invalid-image': 'not a valid image',
  'turn-limit': 'over the per-turn limit',
  'session-limit': 'over the session limit',
  'download-failed': 'couldn’t be downloaded from the host',
  'storage-failed': 'couldn’t be stored',
}

const OMISSION_CODES = Object.keys(
  OMISSION_REASONS,
) as ToolAttachmentOmissionCode[]

export interface ToolResultOmittedImages {
  /** How many images were left out, across every reason. */
  count: number
  /** "1 image left out", "3 images left out"; null when none were. */
  label: string | null
  /**
   * Why, one fact per reason: the reason alone when there is one ("too
   * large"), each with its count when there are several ("2 too large").
   */
  reasons: string[]
}

/** A count the host sent, as a whole number of images; anything else is none. */
function imageCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

/** The words under a tool result for the images it produced but not shown. */
export function describeOmittedImages(
  omissions: ToolAttachmentOmissions | undefined,
): ToolResultOmittedImages {
  const counted = OMISSION_CODES.map((code) => ({
    code,
    count: imageCount(omissions?.[code]),
  })).filter((entry) => entry.count > 0)

  const count = counted.reduce((total, entry) => total + entry.count, 0)
  if (count === 0) {
    return { count: 0, label: null, reasons: [] }
  }

  const oneReason = counted.length === 1
  return {
    count,
    label: `${count} ${count === 1 ? 'image' : 'images'} left out`,
    reasons: counted.map((entry) =>
      oneReason
        ? OMISSION_REASONS[entry.code]
        : `${entry.count} ${OMISSION_REASONS[entry.code]}`,
    ),
  }
}
