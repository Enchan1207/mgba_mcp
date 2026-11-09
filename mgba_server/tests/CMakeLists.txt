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
