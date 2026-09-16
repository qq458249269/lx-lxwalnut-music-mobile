// 私有 fork 原生模块声明（lyswhut forks，无内置类型）

declare module 'react-native-udp' {
  import dgram from 'dgram'
  export default dgram
}

declare module 'react-native-file-system' {
  export namespace Dirs {
    const CacheDir: string
    const SDCardDir: string
    const DocumentDir: string
    const DownloadDir: string
    const DCIMDir: string
    const MovieDir: string
    const MusicDir: string
    const PictureDir: string
    const MainBundleDir: string
  }

  export type Encoding = 'utf8' | 'base64'
  export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'
  export interface OpenDocumentOptions {
    title?: string
    mimeTypes?: string[]
    extTypes?: string[]
    toPath?: string
    allFiles?: boolean
  }
  export interface FileStat {
    name: string
    path: string
    mtime: number
    size: number
    type: 'file' | 'directory'
    // [fork] android scoped storage 扩展字段
    mimeType?: string
    canRead?: boolean
    isFile?: boolean
    isDirectory?: boolean
    lastModified?: number
  }
  export type FileType = FileStat

  export const FileSystem: {
    ls(path: string): Promise<FileStat[]>
    unlink(path: string): Promise<void>
    mkdir(path: string): Promise<void>
    stat(path: string): Promise<FileStat>
    hash(path: string, algorithm: HashAlgorithm): Promise<string>
    readFile(path: string, encoding?: Encoding): Promise<string>
    mv(fromPath: string, toPath: string): Promise<void>
    gzipFile(fromPath: string, toPath: string): Promise<void>
    unGzipFile(fromPath: string, toPath: string): Promise<void>
    gzipString(data: string, encoding?: Encoding): Promise<string>
    unGzipString(data: string, encoding?: Encoding): Promise<string>
    rename(path: string, name: string): Promise<void>
    writeFile(path: string, data: string, encoding?: Encoding): Promise<void>
    appendFile(path: string, data: string, encoding?: Encoding): Promise<void>
  }

  export const AndroidScoped: {
    openDocumentTree(persist?: boolean): Promise<FileStat | null>
    openDocument(options: OpenDocumentOptions): Promise<(FileStat & { data?: string }) | null>
    releasePersistableUriPermission(path: string): Promise<void>
    getPersistedUriPermissions(): Promise<string[]>
  }

  export function getExternalStoragePaths(is_removable?: boolean): Promise<string[]>
}

declare module 'react-native-local-media-metadata' {
  export interface MusicMetadata {
    // [fork] lx-walnut 字段命名
    name?: string
    singer?: string
    albumName?: string
    interval?: string
    ext?: string
    // 通用别名
    id?: string
    title?: string
    artist?: string
    album?: string
    albumArtist?: string
    genre?: string
    composer?: string
    year?: number
    track?: number
    disc?: number
    duration?: number
    bitrate?: number
    sampleRate?: number
    channels?: number
    pic?: string
  }
  export type MusicMetadataFull = MusicMetadata & {
    pic?: string
    lyric?: string
  }
  export function readMetadata(filePath: string): Promise<MusicMetadata>
  export function writeMetadata(
    filePath: string,
    metadata: { name?: string; singer?: string; albumName?: string; title?: string; artist?: string; album?: string; albumArtist?: string; track?: number; pic?: string },
  ): Promise<void>
  export function writePic(filePath: string, picPath: string): Promise<void>
  export function readPic(filePath: string, cachePath: string): Promise<string>
  export function readLyric(filePath: string): Promise<string | null>
  export function writeLyric(filePath: string, lyric: string): Promise<void>
}