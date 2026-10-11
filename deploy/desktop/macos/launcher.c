// OpenCaptions.app's program (Contents/MacOS/OpenCaptions): a real Mac executable for Apple and Intel chips that runs
// the launcher script (Contents/Resources/launch.sh). macOS asks for Rosetta for an app whose program is a script, and
// Macs with Apple chips don't have Rosetta unless something installed it. Built by scripts/package-desktop.js:
//   clang -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 -O2 -o OpenCaptions launcher.c
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <unistd.h>

int main(void) {
  char exe[PATH_MAX], script[PATH_MAX];
  uint32_t size = sizeof exe;
  if (_NSGetExecutablePath(exe, &size) != 0) return 1;
  snprintf(script, sizeof script, "%s/../Resources/launch.sh", dirname(exe));
  execl("/bin/bash", "bash", script, (char *)NULL);
  perror("OpenCaptions: launch.sh");
  return 1;
}
