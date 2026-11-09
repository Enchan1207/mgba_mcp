#include "mgba_mcp/mgba_mcp.h"

unsigned int factorial(unsigned int n) {
    if (n == 0) {
        return 1;
    }
    return n * factorial(n - 1);
}
