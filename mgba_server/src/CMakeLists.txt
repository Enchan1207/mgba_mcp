add_library(mgba_command STATIC command.c)

target_include_directories(mgba_command PUBLIC
    $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
)
