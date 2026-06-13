/**
 * render.mjs — скрипт рендера для видеографа-агента.
 *
 * Использование:
 *   node render.mjs <CompId> <output.mov>          # ProRes 4444 с альфа-каналом
 *   node render.mjs <CompId> <output.png> --png    # один PNG-кадр (кадр 30 по умолчанию)
 *   node render.mjs <CompId> <output.mp4> --mp4    # H.264 без альфы (для YouTube)
 *
 * Примеры:
 *   node render.mjs TitleCard out/titlecard.mov
 *   node render.mjs LowerThird out/lowerthird.png --png
 *   node render.mjs ProgressStepper out/stepper.mp4 --mp4
 *
 * Наложение на видео через ffmpeg (пример):
 *   ffmpeg -i source.mp4 -i titlecard.mov \
 *     -filter_complex "[0:v][1:v]overlay=0:0:enable='between(t,0,3)'" \
 *     -c:a copy output.mp4
 *
 * Для нескольких вставок по тайм-кодам:
 *   ffmpeg -i source.mp4 -i titlecard.mov -i lowerthird.mov \
 *     -filter_complex "
 *       [0:v][1:v]overlay=0:0:enable='between(t,0,3)'[v1];
 *       [v1][2:v]overlay=0:0:enable='between(t,180,184)'[vout]
 *     " -map "[vout]" -map 0:a -c:a copy output.mp4
 */

import { execSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Использование: node render.mjs <CompId> <output.mov|.png> [--png|--mp4]");
  console.error("Пример: node render.mjs TitleCard out/titlecard.mov");
  process.exit(1);
}

const compId = args[0];
const outputPath = path.resolve(__dirname, args[1]);
const isPng = args.includes("--png");
const isMp4 = args.includes("--mp4");
const entryPoint = path.join(__dirname, "src/index.ts");

// Прокидываем --props=<file> в команду remotion (для динамических композиций)
const propsArg = args.find((a) => a.startsWith("--props="));
const extraArgs = propsArg ? [propsArg] : [];

console.log(`\n🎬 Remotion render — Terminal Noir`);
console.log(`   Comp:   ${compId}`);
console.log(`   Output: ${outputPath}`);

if (isPng) {
  // Рендер одного кадра PNG
  const frame = args.find(a => a.startsWith("--frame="))?.split("=")[1] ?? "30";
  console.log(`   Mode:   PNG still (кадр ${frame})\n`);
  const cmd = [
    "npx", "remotion", "still",
    entryPoint,
    compId,
    outputPath,
    `--frame=${frame}`,
    "--overwrite",
    ...extraArgs,
  ];
  console.log("$ " + cmd.join(" ") + "\n");
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    cwd: __dirname,
    env: { ...process.env, PATH: process.env.PATH },
  });
  if (result.status !== 0) {
    console.error("❌ Рендер PNG завершился с ошибкой");
    process.exit(result.status ?? 1);
  }
} else if (isMp4) {
  // H.264 без альфы — для превью или YouTube
  console.log(`   Mode:   MP4 H.264 (без альфа-канала)\n`);
  const cmd = [
    "npx", "remotion", "render",
    entryPoint,
    compId,
    outputPath,
    "--codec=h264",
    "--overwrite",
    ...extraArgs,
  ];
  console.log("$ " + cmd.join(" ") + "\n");
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    cwd: __dirname,
    env: { ...process.env, PATH: process.env.PATH },
  });
  if (result.status !== 0) {
    console.error("❌ Рендер MP4 завершился с ошибкой");
    process.exit(result.status ?? 1);
  }
} else {
  // ProRes 4444 с альфа-каналом — основной режим для оверлея
  console.log(`   Mode:   ProRes 4444 с альфа-каналом (.mov)\n`);

  // ProRes с альфой: prores-ks + profile=4 (4444) + pixel_format yuva444p10le
  // Примечание: на Apple Silicon Remotion поддерживает prores через --codec=prores
  // Если упадёт — автоматически пробуем PNG-секвенцию как fallback
  const cmd = [
    "npx", "remotion", "render",
    entryPoint,
    compId,
    outputPath,
    "--codec=prores",
    "--prores-profile=4444",
    "--pixel-format=yuva444p10le",
    "--overwrite",
    ...extraArgs,
  ];
  console.log("$ " + cmd.join(" ") + "\n");
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    cwd: __dirname,
    env: { ...process.env, PATH: process.env.PATH },
  });

  if (result.status !== 0) {
    console.warn("\n⚠️  ProRes 4444 не вышло. Пробую PNG-секвенцию как fallback...\n");
    const pngDir = outputPath.replace(/\.mov$/, "-png-seq");
    const fallbackCmd = [
      "npx", "remotion", "render",
      entryPoint,
      compId,
      pngDir,
      "--image-format=png",
      "--overwrite",
    ];
    console.log("$ " + fallbackCmd.join(" ") + "\n");
    const fallbackResult = spawnSync(fallbackCmd[0], fallbackCmd.slice(1), {
      stdio: "inherit",
      cwd: __dirname,
      env: { ...process.env, PATH: process.env.PATH },
    });
    if (fallbackResult.status !== 0) {
      console.error("❌ Оба варианта рендера упали. Проверь ошибки выше.");
      process.exit(1);
    }
    console.log(`\n✅ PNG-секвенция готова: ${pngDir}`);
    console.log(`   Собрать в .mov: ffmpeg -framerate 30 -i "${pngDir}/%06d.png" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out/${compId}.mov`);
    process.exit(0);
  }
}

console.log(`\n✅ Готово: ${outputPath}`);
console.log(`\nПроверить файл:`);
console.log(`   ffprobe -v quiet -show_streams -select_streams v:0 "${outputPath}" | grep -E "codec_name|width|height|pix_fmt|nb_frames"`);
