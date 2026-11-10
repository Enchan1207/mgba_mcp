add_library(mgba_command STATIC 
    command.c
)

target_include_directories(mgba_command PUBLIC
    $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
)

add_library(mgba_session STATIC
    session.c
)

target_include_directories(mgba_session PUBLIC
    $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
)

target_link_libraries(mgba_session PUBLIC mgba mgba_command)
