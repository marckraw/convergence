import type { FavoriteModelRef } from '@/entities/app-settings'

export const MODEL_PICKER_FAVORITES_FILTER_ID = 'favorites'

export function modelPickerFavoriteKey(
  providerId: string,
  modelId: string,
): string {
  return `${providerId}\0${modelId}`
}

export function createFavoriteModelKeySet(
  favorites: FavoriteModelRef[],
): Set<string> {
  return new Set(
    favorites.map((favorite) =>
      modelPickerFavoriteKey(favorite.providerId, favorite.modelId),
    ),
  )
}

export function createFavoriteModelOrderMap(
  favorites: FavoriteModelRef[],
): Map<string, number> {
  return new Map(
    favorites.map((favorite, index) => [
      modelPickerFavoriteKey(favorite.providerId, favorite.modelId),
      index,
    ]),
  )
}

export function toggleFavoriteModel(
  favorites: FavoriteModelRef[],
  next: FavoriteModelRef,
): FavoriteModelRef[] {
  const key = modelPickerFavoriteKey(next.providerId, next.modelId)
  const hasFavorite = favorites.some(
    (favorite) =>
      modelPickerFavoriteKey(favorite.providerId, favorite.modelId) === key,
  )

  if (hasFavorite) {
    return favorites.filter(
      (favorite) =>
        modelPickerFavoriteKey(favorite.providerId, favorite.modelId) !== key,
    )
  }

  return [...favorites, next]
}
