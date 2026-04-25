import { BundleMethod } from '@aiagg/db';

/**
 * Maps a catalog Method.code (e.g. "text_to_image", "image_to_video")
 * to the canonical BundleMethod enum used in the Bundle table.
 */
export function methodCodeToBundleMethod(code: string): BundleMethod {
  switch (code) {
    case 'text_to_image':
    case 'image_generation':
      return BundleMethod.IMAGE_GENERATION;
    case 'image_edit':
    case 'image_to_image':
    case 'multi_reference_image':
    case 'virtual_try_on':
      return BundleMethod.IMAGE_EDIT;
    case 'text_to_video':
    case 'image_to_video':
    case 'video_extend':
    case 'first_last_frame_to_video':
    case 'video_to_video':
    case 'video_effect':
    case 'lip_sync':
      return BundleMethod.VIDEO_GENERATION;
    case 'text_to_audio':
    case 'tts':
      return BundleMethod.AUDIO_GENERATION;
    case 'transcribe':
      return BundleMethod.AUDIO_TRANSCRIPTION;
    case 'embedding':
      return BundleMethod.EMBEDDING;
    case 'text_generation':
    case 'chat':
      return BundleMethod.TEXT_GENERATION;
    default:
      return BundleMethod.OTHER;
  }
}
