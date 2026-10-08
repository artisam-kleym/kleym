import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kleym', short_name: 'Kleym', description: 'Distribute Stellar assets with a link.',
    start_url: '/', display: 'browser',
    related_applications: [{ platform: 'play', id: 'com.lantern.wallet', url: 'https://play.google.com/store/apps/details?id=com.lantern.wallet' }],
    prefer_related_applications: false,
  }
}
