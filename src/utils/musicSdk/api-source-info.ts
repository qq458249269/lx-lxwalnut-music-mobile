const sources: Array<{
  id: string
  name: string
  disabled: boolean
  supportQualitys: Partial<Record<LX.OnlineSource, LX.Quality[]>>
}> = [
  {
    id: 'builtin',
    name: '内置接口',
    disabled: false,
    supportQualitys: {
      kw: ['128k', '320k', 'flac', 'hires'],
      kg: ['128k', '320k', 'flac', 'hires'],
      tx: ['128k', '320k', 'flac', 'hires'],
      mg: ['128k', '320k', 'flac', 'hires'],
    },
  },
]

export default sources