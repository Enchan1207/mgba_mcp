#include <gtest/gtest.h>

#include "mgba_mcp/mgba_mcp.h"

TEST(FactorialTest, Zero) {
    EXPECT_EQ(factorial(0), 1u);
}

TEST(FactorialTest, Ten) {
    EXPECT_EQ(factorial(10), 3628800u);
}
