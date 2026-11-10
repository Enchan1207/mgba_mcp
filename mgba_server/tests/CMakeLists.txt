include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.15.2
)
FetchContent_MakeAvailable(googletest)

add_executable(mgba_command_test test_command.cpp)
target_link_libraries(mgba_command_test PRIVATE
    GTest::gtest_main
    mgba_command
)

include(GoogleTest)
gtest_discover_tests(mgba_command_test)

add_executable(mgba_session_test test_session.cpp)
target_link_libraries(mgba_session_test PRIVATE
    GTest::gtest_main
    mgba_session
)
target_compile_features(mgba_session_test PRIVATE cxx_std_17)
gtest_discover_tests(mgba_session_test)

add_executable(mgba_server_test test_server.cpp)
target_link_libraries(mgba_server_test PRIVATE GTest::gtest_main)
target_compile_features(mgba_server_test PRIVATE cxx_std_17)
target_compile_definitions(mgba_server_test PRIVATE SERVER_BINARY="$<TARGET_FILE:mgba_server>")
add_dependencies(mgba_server_test mgba_server)
gtest_discover_tests(mgba_server_test)
