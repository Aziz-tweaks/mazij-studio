// Roadmap #23 — iOS Live Photo export.
//
// Why this exists as a separate native tool instead of extending the FFmpeg
// pipeline: a Live Photo MOV needs two things FFmpeg/exiftool cannot reliably
// produce (verified by hand before writing this file, not assumed from docs):
// (a) an asset-level `com.apple.quicktime.content.identifier` item in the `mdta`
// keyspace, and (b) a *timed metadata track* carrying
// `com.apple.quicktime.still-image-time` (SInt8, value 0) at the still frame's
// timestamp. FFmpeg can mux arbitrary metadata atoms but has no public way to
// author a `mebx`/boxed-metadata sample track; exiftool can only rewrite
// existing atoms, not create a new track. AVFoundation's
// `AVAssetWriterInputMetadataAdaptor` is Apple's own documented mechanism for
// exactly this, and is available here because Mazij is a native macOS app —
// this binary is built from this source at `npm run setup:livephoto` time
// (scripts/setup-livephoto-tool.sh) the same way the FFmpeg sidecar is staged,
// and shipped as a second Tauri sidecar binary.
//
// Two subcommands, run independently by the TypeScript caller
// (src/lib/livePhotoExport.ts):
//
//   lptool still --in <png> --out <jpg> --content-id <uuid> [--quality high|med]
//     Re-encodes a single already-rendered artboard PNG frame as JPEG, writing
//     the shared identifier into Apple's MakerNote dictionary (key "17" —
//     `kCGImagePropertyMakerAppleDictionary`, exiftool's `Apple:ContentIdentifier`,
//     MakerNote tag 0x0011) via ImageIO.
//
//   lptool mov --frames-dir <dir> --fps <n> --out <mov> --content-id <uuid>
//              --still-time <seconds> [--quality high|med]
//     Encodes a directory of already-rendered artboard PNG frames
//     (`frame-00001.png`, …, numeric order) into a real H.264 MOV via
//     AVAssetWriter, tags the asset with the same content identifier, and
//     appends one `still-image-time` timed-metadata sample at --still-time.
//
//   lptool import --still <jpg> --mov <mov>
//     Adds the pair to the macOS Photos library as one genuine Live Photo asset.
//
//     This subcommand exists because of a real failure, not a feature idea:
//     the owner exported a Live Photo, AirDropped the two files to his iPhone,
//     and got a plain video — exactly as the old UI hint told him to do. That
//     hint was wrong. AirDrop and Finder copy the files individually, and iOS
//     treats two separately-received items as a photo and a video; nothing in
//     that path ever reads the shared content identifier and performs the
//     pairing. The pairing is done by the *receiving library*, and PhotoKit's
//     `PHAssetCreationRequest` with a `.pairedVideo` resource is Apple's only
//     supported way to ask for it. Once the asset lands in the Photos library it
//     is a real Live Photo, and iCloud carries it to the iPhone as one.
//
// The first three subcommands consume frames already produced by the shared
// `renderArtboardFrames`/`renderArtboardPng` canvas path (src/lib/exportArtboard.ts)
// — this tool never rasterizes anything itself, so a Live Photo's video content
// is pixel-sourced identically to PNG/MP4 export.
import Foundation
import AVFoundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
import Photos

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

func argValue(_ args: [String], _ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

let args = Array(CommandLine.arguments.dropFirst())
guard let mode = args.first else { fail("usage: lptool still|mov ...") }
let quality = argValue(args, "--quality") ?? "high"

/// Crops an odd-dimensioned frame down to the nearest even width/height.
///
/// Why this exists (found 18 October 2026, reported by the owner as "the export
/// gave me a video, not a live photo"): VideoToolbox's H.264 encoder silently
/// rounds an odd dimension down to even — a 3600×1881 artboard produced a
/// 3600×1880 MOV while the still JPEG kept its full 1881 rows. iOS pairs a
/// Live Photo only when the still and the video agree on dimensions, so the
/// one-pixel disagreement made Photos drop the pairing and show a plain video
/// even though both halves carried the correct matching content identifier.
///
/// Both subcommands route through this same function so the still and the video
/// can never disagree: identical crop, identical rect, identical pixels. The
/// crop is applied rather than scaling the frame into an even-sized context,
/// because scaling one half and cropping the other would reintroduce a
/// sub-pixel offset between them.
func snapToEvenDimensions(_ image: CGImage) -> CGImage {
    let evenW = image.width - (image.width % 2)
    let evenH = image.height - (image.height % 2)
    if evenW == image.width && evenH == image.height { return image }
    guard evenW > 0, evenH > 0,
          let cropped = image.cropping(to: CGRect(x: 0, y: 0, width: evenW, height: evenH)) else {
        return image
    }
    return cropped
}

if mode == "still" {
    guard let inPath = argValue(args, "--in"),
          let outPath = argValue(args, "--out"),
          let contentId = argValue(args, "--content-id") else {
        fail("still: need --in --out --content-id")
    }
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: inPath) as CFURL, nil),
          let rawImage = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        fail("still: failed to read input PNG frame at \(inPath)")
    }
    let cgImage = snapToEvenDimensions(rawImage)
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
        fail("still: failed to create JPEG destination at \(outPath)")
    }
    // Apple's MakerNote dictionary key "17" (decimal for MakerNote tag 0x0011) is
    // the undocumented-but-widely-verified slot exiftool reads/writes as
    // `Apple:ContentIdentifier` — this is the still half of the Live Photo pairing
    // described in docs/ROADMAP-PROGRESS.md #23.
    let makerApple: [String: Any] = ["17": contentId]
    let props: [CFString: Any] = [
        kCGImagePropertyMakerAppleDictionary: makerApple,
        kCGImageDestinationLossyCompressionQuality: quality == "high" ? 0.92 : 0.8,
    ]
    CGImageDestinationAddImage(dest, cgImage, props as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { fail("still: failed to finalize JPEG") }
    print("ok")
    exit(0)
}

if mode == "mov" {
    guard let framesDir = argValue(args, "--frames-dir"),
          let fpsStr = argValue(args, "--fps"), let fps = Int32(fpsStr),
          let outPath = argValue(args, "--out"),
          let contentId = argValue(args, "--content-id"),
          let stillTimeStr = argValue(args, "--still-time"), let stillTime = Double(stillTimeStr) else {
        fail("mov: need --frames-dir --fps --out --content-id --still-time")
    }

    let fm = FileManager.default
    guard let frameFiles = try? fm.contentsOfDirectory(atPath: framesDir).filter({ $0.hasSuffix(".png") }).sorted(),
          !frameFiles.isEmpty else {
        fail("mov: no PNG frames found in \(framesDir)")
    }

    guard let firstSrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: framesDir + "/" + frameFiles[0]) as CFURL, nil),
          let firstImage = CGImageSourceCreateImageAtIndex(firstSrc, 0, nil) else {
        fail("mov: failed to read first frame")
    }
    // Same even-dimension snap the `still` subcommand applies, so the paired
    // halves always report identical width/height to iOS. See
    // `snapToEvenDimensions` for why a one-pixel disagreement breaks pairing.
    let width = firstImage.width - (firstImage.width % 2)
    let height = firstImage.height - (firstImage.height % 2)

    let outURL = URL(fileURLWithPath: outPath)
    try? fm.removeItem(at: outURL)

    guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mov) else {
        fail("mov: failed to create AVAssetWriter for \(outPath)")
    }

    // Asset-level content identifier (com.apple.quicktime.content.identifier, mdta
    // keyspace) — the UUID that binds this MOV to its paired still JPEG.
    let identifierItem = AVMutableMetadataItem()
    identifierItem.keySpace = AVMetadataKeySpace(rawValue: "mdta")
    identifierItem.key = "com.apple.quicktime.content.identifier" as NSString
    identifierItem.value = contentId as NSString
    identifierItem.dataType = kCMMetadataBaseDataType_UTF8 as String
    writer.metadata = [identifierItem]

    // bits-per-pixel heuristic, same family of calculation the MP4 exporter's CRF
    // choice serves (videoExport.ts) — "high" errs generous since Live Photos are
    // short (1.5-3s) and the bitrate cost is small in absolute terms.
    let bitsPerPixel = quality == "high" ? 0.5 : 0.25
    let bitrate = Int(Double(width * height) * Double(fps) * bitsPerPixel)
    let videoSettings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
    ]
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoInput.expectsMediaDataInRealTime = false
    // 32BGRA matches CGContext's host-native (little-endian) in-memory byte order
    // for an ARGB-alpha-skip-first bitmap on Apple Silicon — using the
    // big-endian-defined 32ARGB format here instead silently swaps R/B per pixel
    // (caught by hand during development: per-channel PSNR against the source PNG
    // was wildly asymmetric — R and B badly off, G fine — the signature of a
    // channel-order mismatch, not compression loss).
    let pixelAttrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: pixelAttrs)
    guard writer.canAdd(videoInput) else { fail("mov: cannot add video input") }
    writer.add(videoInput)

    // Timed metadata track: com.apple.quicktime.still-image-time (SInt8, value 0).
    let stillKeySpace = "mdta"
    let stillKey = "com.apple.quicktime.still-image-time"
    let spec: [CFString: Any] = [
        kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier: "\(stillKeySpace)/\(stillKey)",
        kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType: kCMMetadataBaseDataType_SInt8,
    ]
    var metadataDesc: CMFormatDescription?
    let specStatus = CMMetadataFormatDescriptionCreateWithMetadataSpecifications(
        allocator: kCFAllocatorDefault,
        metadataType: kCMMetadataFormatType_Boxed,
        metadataSpecifications: [spec] as CFArray,
        formatDescriptionOut: &metadataDesc)
    guard specStatus == noErr, let mdDesc = metadataDesc else {
        fail("mov: failed to create still-image-time format description (OSStatus \(specStatus))")
    }
    let metadataInput = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: mdDesc)
    metadataInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(metadataInput) else { fail("mov: cannot add metadata input") }
    writer.add(metadataInput)
    let metadataAdaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metadataInput)

    guard writer.startWriting() else {
        fail("mov: startWriting failed: \(writer.error?.localizedDescription ?? "?")")
    }
    writer.startSession(atSourceTime: .zero)

    // Appended once, up front: a single-sample timed metadata track needs exactly
    // one group at the still's timestamp, independent of the per-frame video loop
    // below, then finishes immediately.
    let stillCMTime = CMTime(seconds: stillTime, preferredTimescale: 600)
    let stillItem = AVMutableMetadataItem()
    stillItem.keySpace = AVMetadataKeySpace(rawValue: stillKeySpace)
    stillItem.key = stillKey as NSString
    stillItem.value = 0 as NSNumber
    stillItem.dataType = kCMMetadataBaseDataType_SInt8 as String
    let group = AVTimedMetadataGroup(items: [stillItem], timeRange: CMTimeRange(start: stillCMTime, duration: CMTime(value: 1, timescale: 600)))
    guard metadataAdaptor.append(group) else {
        fail("mov: failed to append still-image-time metadata group")
    }
    metadataInput.markAsFinished()

    var frameIndex = 0
    let queue = DispatchQueue(label: "mazij.livephoto.video-writer")
    let sem = DispatchSemaphore(value: 0)

    videoInput.requestMediaDataWhenReady(on: queue) {
        while videoInput.isReadyForMoreMediaData {
            if frameIndex >= frameFiles.count {
                videoInput.markAsFinished()
                sem.signal()
                return
            }
            let path = framesDir + "/" + frameFiles[frameIndex]
            guard let fsrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
                  let rawFrame = CGImageSourceCreateImageAtIndex(fsrc, 0, nil) else {
                fail("mov: failed to read frame \(path)")
            }
            // Crop, never scale: `draw`ing a 1881-tall frame into an 1880-tall
            // rect would squash it, leaving a sub-pixel offset against the
            // cropped still. Cropping both halves keeps them pixel-identical.
            let cgImage = snapToEvenDimensions(rawFrame)
            guard let pool = adaptor.pixelBufferPool else { fail("mov: no pixel buffer pool") }
            var pixelBufferOut: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBufferOut)
            guard let pixelBuffer = pixelBufferOut else { fail("mov: failed to create pixel buffer") }

            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            let ctx = CGContext(
                data: CVPixelBufferGetBaseAddress(pixelBuffer),
                width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
            ctx?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            let pts = CMTime(value: Int64(frameIndex), timescale: fps)
            guard adaptor.append(pixelBuffer, withPresentationTime: pts) else {
                fail("mov: failed to append frame \(frameIndex): \(writer.error?.localizedDescription ?? "?")")
            }
            frameIndex += 1
            print("frame=\(frameIndex)")
            fflush(stdout)
        }
    }

    sem.wait()

    let finishSem = DispatchSemaphore(value: 0)
    writer.finishWriting { finishSem.signal() }
    finishSem.wait()

    guard writer.status == .completed else {
        fail("mov: writer finished with status \(writer.status.rawValue): \(writer.error?.localizedDescription ?? "?")")
    }
    print("ok")
    exit(0)
}

if mode == "import" {
    guard let stillPath = argValue(args, "--still"),
          let movPath = argValue(args, "--mov") else {
        fail("import: need --still --mov")
    }
    let fm = FileManager.default
    guard fm.fileExists(atPath: stillPath) else { fail("import: still not found at \(stillPath)") }
    guard fm.fileExists(atPath: movPath) else { fail("import: mov not found at \(movPath)") }

    // `.addOnly` rather than `.readWrite`: adding a Live Photo needs no ability to
    // read or alter anything already in the library, and asking for less is what
    // keeps the macOS permission prompt honest about what Mazij actually does.
    let authSem = DispatchSemaphore(value: 0)
    var granted = false
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        granted = (status == .authorized || status == .limited)
        authSem.signal()
    }
    authSem.wait()
    guard granted else {
        fail("import: Photos access denied — grant Mazij access under System Settings › Privacy & Security › Photos")
    }

    var saveError: Error?
    let saveSem = DispatchSemaphore(value: 0)
    PHPhotoLibrary.shared().performChanges {
        let request = PHAssetCreationRequest.forAsset()
        let options = PHAssetResourceCreationOptions()
        options.shouldMoveFile = false   // leave the exported pair on disk
        request.addResource(with: .photo, fileURL: URL(fileURLWithPath: stillPath), options: options)
        // `.pairedVideo` is the resource type that makes this one Live Photo
        // instead of two assets — the whole reason this subcommand exists.
        request.addResource(with: .pairedVideo, fileURL: URL(fileURLWithPath: movPath), options: options)
    } completionHandler: { _, error in
        saveError = error
        saveSem.signal()
    }
    saveSem.wait()

    if let error = saveError {
        fail("import: Photos rejected the pair: \(error.localizedDescription)")
    }
    print("ok")
    exit(0)
}

fail("unknown mode '\(mode)' — expected 'still', 'mov' or 'import'")
