CC := clang
CFLAGS := -fobjc-arc -Wall -Wextra -Werror
FRAMEWORKS := -framework Cocoa -framework ApplicationServices
TARGET := bin/macos-control

.PHONY: all clean

all: $(TARGET)

$(TARGET): main.m
	mkdir -p bin
	$(CC) $(CFLAGS) $(FRAMEWORKS) -o $(TARGET) main.m

clean:
	rm -f $(TARGET)
