#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include <mgba/core/core.h>

#define DEFAULT_FRAMES 900U
#define MAX_FRAMES 18000U

static bool parse_frames(const char* text, unsigned* frames) {
    char* end = NULL;
    errno = 0;
    unsigned long value = strtoul(text, &end, 10);
    if (errno != 0 || text == end || *end != '\0' || value == 0 || value > MAX_FRAMES) {
        return false;
    }
    *frames = (unsigned) value;
    return true;
}

int main(int argc, char* argv[]) {
    if (argc != 3 && argc != 4) {
        fprintf(stderr, "Usage: %s ROM OUTPUT.raw [FRAMES]\n", argv[0]);
        fprintf(stderr, "FRAMES defaults to %u (about 15 seconds of game time).\n", DEFAULT_FRAMES);
        return EXIT_FAILURE;
    }

    unsigned frames = DEFAULT_FRAMES;
    if (argc == 4 && !parse_frames(argv[3], &frames)) {
        fprintf(stderr, "FRAMES must be an integer from 1 to %u.\n", MAX_FRAMES);
        return EXIT_FAILURE;
    }

    struct mCore* core = mCoreFind(argv[1]);
    if (!core) {
        fprintf(stderr, "Cannot open a supported ROM: %s\n", argv[1]);
        return EXIT_FAILURE;
    }
    if (!core->init(core)) {
        fprintf(stderr, "Failed to initialize mGBA.\n");
        return EXIT_FAILURE;
    }

    int result = EXIT_FAILURE;
    bool config_initialized = false;
    color_t* video_buffer = NULL;
    FILE* output = NULL;
    unsigned width = 0;
    unsigned height = 0;
    size_t pixel_count = 0;

    core->desiredVideoDimensions(core, &width, &height);
    if (width == 0 || height == 0 || width > SIZE_MAX / height / sizeof(*video_buffer)) {
        fprintf(stderr, "Invalid video dimensions.\n");
        goto cleanup;
    }
    pixel_count = (size_t) width * height;
    video_buffer = calloc(pixel_count, sizeof(*video_buffer));
    if (!video_buffer) {
        fprintf(stderr, "Failed to allocate video buffer.\n");
        goto cleanup;
    }
    core->setVideoBuffer(core, video_buffer, width);

    if (!mCoreLoadFile(core, argv[1])) {
        fprintf(stderr, "Failed to load ROM: %s\n", argv[1]);
        goto cleanup;
    }

    mCoreInitConfig(core, NULL);
    config_initialized = true;
    mCoreLoadConfig(core);
    if (core->platform(core) == mPLATFORM_GB) {
        mCoreConfigSetValue(&core->config, "gb.model", "DMG");
        mCoreConfigSetValue(&core->config, "sgb.model", "DMG");
        mCoreConfigSetValue(&core->config, "cgb.hybridModel", "DMG");
        mCoreConfigSetValue(&core->config, "cgb.sgbModel", "DMG");
    }
    core->reset(core);

    unsigned output_width = 0;
    unsigned output_height = 0;
    core->desiredVideoDimensions(core, &output_width, &output_height);
    if (output_width == 0 || output_height == 0 ||
        output_width > SIZE_MAX / output_height / sizeof(*video_buffer) ||
        (size_t) output_width * output_height > pixel_count) {
        fprintf(stderr, "Invalid video dimensions after reset.\n");
        goto cleanup;
    }
    width = output_width;
    height = output_height;
    pixel_count = (size_t) width * height;
    core->setVideoBuffer(core, video_buffer, width);

    for (unsigned i = 0; i < frames; ++i) {
        core->runFrame(core);
    }

    output = fopen(argv[2], "wb");
    if (!output) {
        perror("Cannot create raw frame");
        goto cleanup;
    }
    if (fwrite(video_buffer, sizeof(*video_buffer), pixel_count, output) != pixel_count) {
        perror("Cannot write raw frame");
        goto cleanup;
    }
    if (fclose(output) != 0) {
        output = NULL;
        perror("Cannot close raw frame");
        goto cleanup;
    }
    output = NULL;

    printf("Saved %ux%u frame after %u frames: %s (%zu bytes/pixel)\n",
           width, height, frames, argv[2], sizeof(*video_buffer));
    result = EXIT_SUCCESS;

cleanup:
    if (output) {
        fclose(output);
    }
    if (config_initialized) {
        mCoreConfigDeinit(&core->config);
    }
    core->deinit(core);
    free(video_buffer);
    return result;
}
