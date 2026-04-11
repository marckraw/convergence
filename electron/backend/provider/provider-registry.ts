import type { Provider } from './provider.types'

export class ProviderRegistry {
  private providers = new Map<string, Provider>()

  register(provider: Provider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id)
  }

  getAll(): Provider[] {
    return Array.from(this.providers.values())
  }
}
