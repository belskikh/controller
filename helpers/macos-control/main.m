#import <ApplicationServices/ApplicationServices.h>
#import <Cocoa/Cocoa.h>
#import <unistd.h>

static void WriteJSON(NSDictionary *payload, FILE *stream) {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload
                                                   options:NSJSONWritingSortedKeys
                                                     error:&error];
    if (data == nil) {
        const char *fallback = "{\"error\":\"JSON encoding failed\"}\n";
        fwrite(fallback, 1, strlen(fallback), stream);
        return;
    }
    fwrite(data.bytes, 1, data.length, stream);
    fputc('\n', stream);
}

static int Fail(NSString *message) {
    WriteJSON(@{@"error": message}, stderr);
    return 2;
}

static NSString *ValueAfter(NSArray<NSString *> *arguments, NSUInteger index) {
    NSUInteger valueIndex = index + 1;
    return valueIndex < arguments.count ? arguments[valueIndex] : nil;
}

static NSDictionary<NSString *, NSNumber *> *KeyCodes(void) {
    return @{
        @"a": @0, @"s": @1, @"d": @2, @"f": @3, @"h": @4, @"g": @5,
        @"z": @6, @"x": @7, @"c": @8, @"v": @9, @"b": @11, @"q": @12,
        @"w": @13, @"e": @14, @"r": @15, @"y": @16, @"t": @17,
        @"1": @18, @"2": @19, @"3": @20, @"4": @21, @"6": @22,
        @"5": @23, @"=": @24, @"9": @25, @"7": @26, @"-": @27,
        @"8": @28, @"0": @29, @"]": @30, @"o": @31, @"u": @32,
        @"[": @33, @"i": @34, @"p": @35, @"return": @36, @"enter": @36,
        @"l": @37, @"j": @38, @"'": @39, @"k": @40, @";": @41,
        @"\\": @42, @",": @43, @"/": @44, @"n": @45, @"m": @46,
        @".": @47, @"tab": @48, @"space": @49, @"`": @50,
        @"delete": @51, @"backspace": @51, @"escape": @53, @"esc": @53,
        @"left": @123, @"right": @124, @"down": @125, @"up": @126,
    };
}

static BOOL ParseModifiers(
    NSString *raw,
    CGEventFlags *flags,
    NSString **errorMessage
) {
    *flags = 0;
    for (NSString *part in [raw componentsSeparatedByString:@","]) {
        NSString *name = part.lowercaseString;
        if (name.length == 0 || [name isEqualToString:@"none"]) {
            continue;
        }
        if ([name isEqualToString:@"command"] || [name isEqualToString:@"cmd"]) {
            *flags |= kCGEventFlagMaskCommand;
        } else if ([name isEqualToString:@"shift"]) {
            *flags |= kCGEventFlagMaskShift;
        } else if ([name isEqualToString:@"option"] || [name isEqualToString:@"alt"]) {
            *flags |= kCGEventFlagMaskAlternate;
        } else if ([name isEqualToString:@"control"] || [name isEqualToString:@"ctrl"]) {
            *flags |= kCGEventFlagMaskControl;
        } else if ([name isEqualToString:@"fn"] || [name isEqualToString:@"function"]) {
            *flags |= kCGEventFlagMaskSecondaryFn;
        } else {
            *errorMessage = [NSString stringWithFormat:@"Unsupported modifier: %@", name];
            return NO;
        }
    }
    return YES;
}

static int WriteStatus(void) {
    NSRunningApplication *application =
        NSWorkspace.sharedWorkspace.frontmostApplication;
    NSMutableDictionary *frontmost = [NSMutableDictionary dictionary];
    frontmost[@"bundleIdentifier"] = application.bundleIdentifier ?: NSNull.null;
    frontmost[@"name"] = application.localizedName ?: NSNull.null;
    frontmost[@"pid"] = application == nil
        ? NSNull.null
        : @(application.processIdentifier);
    WriteJSON(
        @{
            @"accessibilityTrusted": @(AXIsProcessTrusted()),
            @"frontmostApplication": frontmost,
        },
        stdout
    );
    return 0;
}

static id CopyAttribute(AXUIElementRef element, CFStringRef attribute) {
    CFTypeRef value = nil;
    AXError result = AXUIElementCopyAttributeValue(element, attribute, &value);
    if (result != kAXErrorSuccess || value == nil) {
        return nil;
    }
    return CFBridgingRelease(value);
}

static NSString *StringAttribute(
    AXUIElementRef element,
    CFStringRef attribute
) {
    id value = CopyAttribute(element, attribute);
    return [value isKindOfClass:NSString.class] ? value : nil;
}

static BOOL IsInteractiveRole(NSString *role) {
    static NSSet<NSString *> *roles;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        roles = [NSSet setWithArray:@[
            (__bridge NSString *)kAXButtonRole,
            (__bridge NSString *)kAXCheckBoxRole,
            (__bridge NSString *)kAXRadioButtonRole,
            (__bridge NSString *)kAXPopUpButtonRole,
            (__bridge NSString *)kAXMenuItemRole,
        ]];
    });
    return [roles containsObject:role];
}

static NSDictionary *PointAttribute(
    AXUIElementRef element,
    CFStringRef attribute
);
static NSDictionary *SizeAttribute(
    AXUIElementRef element,
    CFStringRef attribute
);
static NSArray<NSString *> *ActionNames(AXUIElementRef element);

static void CollectInteractiveControls(
    AXUIElementRef element,
    NSUInteger depth,
    NSUInteger maxDepth,
    NSUInteger limit,
    NSMutableArray<NSDictionary *> *controls
) {
    if (depth > maxDepth || controls.count >= limit) {
        return;
    }

    NSString *role = StringAttribute(element, kAXRoleAttribute);
    if (role != nil && IsInteractiveRole(role)) {
        NSMutableDictionary *control = [NSMutableDictionary dictionary];
        control[@"role"] = role;
        control[@"subrole"] =
            StringAttribute(element, kAXSubroleAttribute) ?: NSNull.null;
        control[@"title"] =
            StringAttribute(element, kAXTitleAttribute) ?: NSNull.null;
        control[@"description"] =
            StringAttribute(element, kAXDescriptionAttribute) ?: NSNull.null;
        control[@"identifier"] =
            StringAttribute(element, kAXIdentifierAttribute) ?: NSNull.null;
        control[@"depth"] = @(depth);
        id enabled = CopyAttribute(element, kAXEnabledAttribute);
        control[@"enabled"] =
            [enabled isKindOfClass:NSNumber.class] ? enabled : NSNull.null;
        id focused = CopyAttribute(element, kAXFocusedAttribute);
        control[@"focused"] =
            [focused isKindOfClass:NSNumber.class] ? focused : NSNull.null;
        id selected = CopyAttribute(element, kAXSelectedAttribute);
        control[@"selected"] =
            [selected isKindOfClass:NSNumber.class] ? selected : NSNull.null;
        control[@"position"] =
            PointAttribute(element, kAXPositionAttribute) ?: NSNull.null;
        control[@"size"] =
            SizeAttribute(element, kAXSizeAttribute) ?: NSNull.null;
        control[@"actions"] = ActionNames(element);
        [controls addObject:control];
    }

    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    if (![rawChildren isKindOfClass:NSArray.class]) {
        return;
    }
    for (id child in (NSArray *)rawChildren) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectInteractiveControls(
            (__bridge AXUIElementRef)child,
            depth + 1,
            maxDepth,
            limit,
            controls
        );
        if (controls.count >= limit) {
            return;
        }
    }
}

static void CollectRoleOutline(
    AXUIElementRef element,
    NSUInteger depth,
    NSUInteger maxDepth,
    NSUInteger limit,
    NSMutableArray<NSDictionary *> *rows
) {
    if (depth > maxDepth || rows.count >= limit) {
        return;
    }
    NSString *role = StringAttribute(element, kAXRoleAttribute);
    NSString *subrole = StringAttribute(element, kAXSubroleAttribute);
    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    NSArray *children = [rawChildren isKindOfClass:NSArray.class]
        ? rawChildren
        : @[];
    [rows addObject:@{
        @"depth": @(depth),
        @"role": role ?: NSNull.null,
        @"subrole": subrole ?: NSNull.null,
        @"childCount": @(children.count),
    }];
    for (id child in children) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectRoleOutline(
            (__bridge AXUIElementRef)child,
            depth + 1,
            maxDepth,
            limit,
            rows
        );
        if (rows.count >= limit) {
            return;
        }
    }
}

static int ListControls(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }

    NSString *bundleIdentifier = nil;
    NSInteger maxDepth = 20;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--max-depth"]) {
            NSString *value = ValueAfter(arguments, index);
            NSScanner *scanner = [NSScanner scannerWithString:value ?: @""];
            NSInteger parsed = 0;
            if (![scanner scanInteger:&parsed]
                || !scanner.isAtEnd
                || parsed < 1
                || parsed > 50) {
                return Fail(@"--max-depth must be an integer from 1 to 50.");
            }
            maxDepth = parsed;
            index += 2;
        } else {
            return Fail(
                [NSString stringWithFormat:@"Unknown controls argument: %@", argument]
            );
        }
    }

    if (bundleIdentifier.length == 0) {
        return Fail(@"controls requires --bundle-id.");
    }
    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }

    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    NSMutableArray<NSDictionary *> *controls = [NSMutableArray array];
    id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
    NSArray *windows = [rawWindows isKindOfClass:NSArray.class]
        ? rawWindows
        : @[];
    for (id window in windows) {
        if (CFGetTypeID((__bridge CFTypeRef)window) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectInteractiveControls(
            (__bridge AXUIElementRef)window,
            0,
            (NSUInteger)maxDepth,
            500,
            controls
        );
    }
    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"windowCount": @(windows.count),
            @"count": @(controls.count),
            @"controls": controls,
        },
        stdout
    );
    return 0;
}

static NSArray<NSDictionary *> *WindowControls(
    AXUIElementRef application,
    NSUInteger maxDepth
) {
    id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
    NSArray *windows = [rawWindows isKindOfClass:NSArray.class]
        ? rawWindows
        : @[];
    NSMutableArray<NSDictionary *> *controls = [NSMutableArray array];
    for (id window in windows) {
        if (CFGetTypeID((__bridge CFTypeRef)window) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectInteractiveControls(
            (__bridge AXUIElementRef)window,
            0,
            maxDepth,
            500,
            controls
        );
    }
    return controls;
}

static NSString *ControlFingerprint(NSDictionary *control) {
    return [NSString stringWithFormat:
        @"%@|%@|%@|%@",
        control[@"role"] ?: @"",
        control[@"subrole"] ?: @"",
        control[@"title"] ?: @"",
        control[@"description"] ?: @""];
}

static void CollectExactMatches(
    AXUIElementRef element,
    NSString *requiredRole,
    NSString *requiredLabel,
    NSUInteger depth,
    NSUInteger maxDepth,
    NSMutableArray *matches
);
static NSDictionary *PointAttribute(
    AXUIElementRef element,
    CFStringRef attribute
);
static NSDictionary *SizeAttribute(
    AXUIElementRef element,
    CFStringRef attribute
);
static BOOL ApplicationIsFrontmost(NSString *bundleIdentifier);

static BOOL ClickElementCenter(AXUIElementRef element) {
    NSDictionary *position = PointAttribute(element, kAXPositionAttribute);
    NSDictionary *size = SizeAttribute(element, kAXSizeAttribute);
    double width = [size[@"width"] doubleValue];
    double height = [size[@"height"] doubleValue];
    if (position == nil
        || size == nil
        || width <= 0
        || height <= 0
        || width > 2000
        || height > 2000) {
        return NO;
    }
    CGPoint center = CGPointMake(
        [position[@"x"] doubleValue] + width / 2.0,
        [position[@"y"] doubleValue] + height / 2.0
    );
    CGEventRef down = CGEventCreateMouseEvent(
        nil, kCGEventLeftMouseDown, center, kCGMouseButtonLeft
    );
    CGEventRef up = CGEventCreateMouseEvent(
        nil, kCGEventLeftMouseUp, center, kCGMouseButtonLeft
    );
    if (down == nil || up == nil) {
        if (down != nil) CFRelease(down);
        if (up != nil) CFRelease(up);
        return NO;
    }
    CGEventPost(kCGHIDEventTap, down);
    [NSThread sleepForTimeInterval:0.02];
    CGEventPost(kCGHIDEventTap, up);
    CFRelease(down);
    CFRelease(up);
    return YES;
}

static int WatchControls(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }
    NSString *bundleIdentifier = nil;
    NSString *openPopupLabel = nil;
    NSInteger durationMilliseconds = 15000;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--duration-ms"]) {
            NSString *value = ValueAfter(arguments, index);
            NSScanner *scanner = [NSScanner scannerWithString:value ?: @""];
            NSInteger parsed = 0;
            if (![scanner scanInteger:&parsed]
                || !scanner.isAtEnd
                || parsed < 1000
                || parsed > 30000) {
                return Fail(@"--duration-ms must be from 1000 to 30000.");
            }
            durationMilliseconds = parsed;
            index += 2;
        } else if ([argument isEqualToString:@"--open-popup-label"]) {
            openPopupLabel = ValueAfter(arguments, index);
            if (openPopupLabel == nil) {
                return Fail(@"--open-popup-label requires a value.");
            }
            index += 2;
        } else {
            return Fail(
                [NSString stringWithFormat:@"Unknown watch argument: %@", argument]
            );
        }
    }
    if (bundleIdentifier.length == 0) {
        return Fail(@"watch-controls requires --bundle-id.");
    }

    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }
    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    NSMutableDictionary<NSString *, NSDictionary *> *baseline =
        [NSMutableDictionary dictionary];
    for (NSDictionary *control in WindowControls(application, 30)) {
        baseline[ControlFingerprint(control)] = control;
    }

    NSInteger elapsed = 0;
    BOOL popupOpened = NO;
    NSMutableArray<NSDictionary *> *observed = [NSMutableArray array];
    NSMutableSet<NSString *> *observedFingerprints = [NSMutableSet set];
    NSMutableArray<NSDictionary *> *removed = [NSMutableArray array];
    NSMutableSet<NSString *> *removedFingerprints = [NSMutableSet set];
    while (elapsed < durationMilliseconds) {
        usleep(100000);
        elapsed += 100;
        if (!popupOpened && openPopupLabel.length > 0) {
            NSMutableArray *matches = [NSMutableArray array];
            CollectExactMatches(
                application,
                (__bridge NSString *)kAXPopUpButtonRole,
                openPopupLabel,
                0,
                30,
                matches
            );
            if (matches.count == 1
                && ApplicationIsFrontmost(bundleIdentifier)) {
                popupOpened = ClickElementCenter(
                    (__bridge AXUIElementRef)matches.firstObject
                );
            }
        }
        NSArray<NSDictionary *> *currentControls =
            WindowControls(application, 30);
        NSMutableSet<NSString *> *currentFingerprints =
            [NSMutableSet set];
        for (NSDictionary *control in currentControls) {
            NSString *fingerprint = ControlFingerprint(control);
            [currentFingerprints addObject:fingerprint];
            if (baseline[fingerprint] == nil
                && ![observedFingerprints containsObject:fingerprint]) {
                [observed addObject:control];
                [observedFingerprints addObject:fingerprint];
            }
        }
        for (NSString *fingerprint in baseline) {
            if (![currentFingerprints containsObject:fingerprint]
                && ![removedFingerprints containsObject:fingerprint]) {
                [removed addObject:baseline[fingerprint]];
                [removedFingerprints addObject:fingerprint];
            }
        }
    }

    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"elapsedMs": @(elapsed),
            @"newControls": observed,
            @"popupOpened": @(popupOpened),
            @"removedControls": removed,
        },
        stdout
    );
    return 0;
}

static int WriteOutline(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }
    if (arguments.count != 2
        || ![arguments[0] isEqualToString:@"--bundle-id"]) {
        return Fail(@"outline requires exactly --bundle-id ID.");
    }
    NSString *bundleIdentifier = arguments[1];
    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }

    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
    NSArray *windows = [rawWindows isKindOfClass:NSArray.class]
        ? rawWindows
        : @[];
    NSMutableArray<NSDictionary *> *rows = [NSMutableArray array];
    for (id window in windows) {
        if (CFGetTypeID((__bridge CFTypeRef)window) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectRoleOutline(
            (__bridge AXUIElementRef)window,
            0,
            12,
            500,
            rows
        );
    }
    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"windowCount": @(windows.count),
            @"nodes": rows,
        },
        stdout
    );
    return 0;
}

static NSString *ControlLabel(AXUIElementRef element) {
    NSString *title = StringAttribute(element, kAXTitleAttribute);
    if (title.length > 0) {
        return title;
    }
    NSString *description = StringAttribute(element, kAXDescriptionAttribute);
    return description.length > 0 ? description : nil;
}

static NSDictionary *PointAttribute(
    AXUIElementRef element,
    CFStringRef attribute
) {
    id rawValue = CopyAttribute(element, attribute);
    if (rawValue == nil
        || CFGetTypeID((__bridge CFTypeRef)rawValue) != AXValueGetTypeID()
        || AXValueGetType((__bridge AXValueRef)rawValue) != kAXValueCGPointType) {
        return nil;
    }
    CGPoint point;
    if (!AXValueGetValue(
        (__bridge AXValueRef)rawValue,
        kAXValueCGPointType,
        &point
    )) {
        return nil;
    }
    return @{@"x": @(point.x), @"y": @(point.y)};
}

static NSDictionary *SizeAttribute(
    AXUIElementRef element,
    CFStringRef attribute
) {
    id rawValue = CopyAttribute(element, attribute);
    if (rawValue == nil
        || CFGetTypeID((__bridge CFTypeRef)rawValue) != AXValueGetTypeID()
        || AXValueGetType((__bridge AXValueRef)rawValue) != kAXValueCGSizeType) {
        return nil;
    }
    CGSize size;
    if (!AXValueGetValue(
        (__bridge AXValueRef)rawValue,
        kAXValueCGSizeType,
        &size
    )) {
        return nil;
    }
    return @{@"width": @(size.width), @"height": @(size.height)};
}

static NSArray<NSString *> *ActionNames(AXUIElementRef element) {
    CFArrayRef rawActions = nil;
    AXError result = AXUIElementCopyActionNames(element, &rawActions);
    if (result != kAXErrorSuccess || rawActions == nil) {
        return @[];
    }
    return CFBridgingRelease(rawActions);
}

static BOOL ApplicationIsFrontmost(NSString *bundleIdentifier) {
    return [
        NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier
        isEqualToString:bundleIdentifier
    ];
}

static void CollectExactMatches(
    AXUIElementRef element,
    NSString *requiredRole,
    NSString *requiredLabel,
    NSUInteger depth,
    NSUInteger maxDepth,
    NSMutableArray *matches
) {
    if (depth > maxDepth || matches.count > 1) {
        return;
    }
    NSString *role = StringAttribute(element, kAXRoleAttribute);
    NSString *label = ControlLabel(element);
    id enabled = CopyAttribute(element, kAXEnabledAttribute);
    if ([role isEqualToString:requiredRole]
        && [label isEqualToString:requiredLabel]
        && [enabled isKindOfClass:NSNumber.class]
        && [enabled boolValue]) {
        [matches addObject:(__bridge id)element];
    }

    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    if (![rawChildren isKindOfClass:NSArray.class]) {
        return;
    }
    for (id child in (NSArray *)rawChildren) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectExactMatches(
            (__bridge AXUIElementRef)child,
            requiredRole,
            requiredLabel,
            depth + 1,
            maxDepth,
            matches
        );
        if (matches.count > 1) {
            return;
        }
    }
}

static NSString *AccessibilityRole(NSString *roleName) {
    if ([roleName isEqualToString:@"button"]) {
        return (__bridge NSString *)kAXButtonRole;
    }
    if ([roleName isEqualToString:@"menu-item"]) {
        return (__bridge NSString *)kAXMenuItemRole;
    }
    if ([roleName isEqualToString:@"pop-up-button"]) {
        return (__bridge NSString *)kAXPopUpButtonRole;
    }
    return nil;
}

static int MatchControl(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }
    if (arguments.count != 6) {
        return Fail(
            @"match requires --bundle-id ID --role ROLE --label EXACT."
        );
    }

    NSString *bundleIdentifier = nil;
    NSString *roleName = nil;
    NSString *label = nil;
    for (NSUInteger index = 0; index < arguments.count; index += 2) {
        NSString *argument = arguments[index];
        NSString *value = ValueAfter(arguments, index);
        if (value == nil) {
            return Fail(@"Every match option requires a value.");
        }
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = value;
        } else if ([argument isEqualToString:@"--role"]) {
            roleName = value;
        } else if ([argument isEqualToString:@"--label"]) {
            label = value;
        } else {
            return Fail(
                [NSString stringWithFormat:@"Unknown match argument: %@", argument]
            );
        }
    }
    NSString *requiredRole = AccessibilityRole(roleName);
    if (bundleIdentifier.length == 0
        || label.length == 0
        || requiredRole == nil) {
        return Fail(@"match received a missing or unsupported value.");
    }

    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }
    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    NSMutableArray *roots = [NSMutableArray array];
    if ([roleName isEqualToString:@"menu-item"]) {
        [roots addObject:(__bridge id)application];
    } else {
        id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
        if ([rawWindows isKindOfClass:NSArray.class]) {
            [roots addObjectsFromArray:rawWindows];
        }
    }
    NSMutableArray *matches = [NSMutableArray array];
    for (id root in roots) {
        CollectExactMatches(
            (__bridge AXUIElementRef)root,
            requiredRole,
            label,
            0,
            30,
            matches
        );
        if (matches.count > 1) {
            break;
        }
    }
    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"role": roleName,
            @"label": label,
            @"matched": @(matches.count),
        },
        stdout
    );
    return 0;
}

static void CollectEditableTextAreas(
    AXUIElementRef element,
    NSUInteger depth,
    NSUInteger maxDepth,
    NSMutableArray *matches
) {
    if (depth > maxDepth || matches.count > 1) {
        return;
    }

    NSString *role = StringAttribute(element, kAXRoleAttribute);
    id enabled = CopyAttribute(element, kAXEnabledAttribute);
    Boolean valueIsSettable = false;
    AXError settableResult = AXUIElementIsAttributeSettable(
        element,
        kAXValueAttribute,
        &valueIsSettable
    );
    if ([role isEqualToString:(__bridge NSString *)kAXTextAreaRole]
        && [enabled isKindOfClass:NSNumber.class]
        && [enabled boolValue]
        && settableResult == kAXErrorSuccess
        && valueIsSettable) {
        [matches addObject:(__bridge id)element];
    }

    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    if (![rawChildren isKindOfClass:NSArray.class]) {
        return;
    }
    for (id child in (NSArray *)rawChildren) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectEditableTextAreas(
            (__bridge AXUIElementRef)child,
            depth + 1,
            maxDepth,
            matches
        );
        if (matches.count > 1) {
            return;
        }
    }
}

static int ClearInput(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }

    NSString *bundleIdentifier = nil;
    BOOL confirmed = NO;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--confirm"]) {
            confirmed = YES;
            index += 1;
        } else {
            return Fail(
                [NSString stringWithFormat:
                    @"Unknown clear-input argument: %@",
                    argument]
            );
        }
    }
    if (bundleIdentifier.length == 0) {
        return Fail(@"clear-input requires --bundle-id.");
    }

    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }

    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    id focusedWindow = CopyAttribute(application, kAXFocusedWindowAttribute);
    if (focusedWindow == nil
        || CFGetTypeID((__bridge CFTypeRef)focusedWindow)
            != AXUIElementGetTypeID()) {
        CFRelease(application);
        return Fail(@"Could not resolve the focused application window.");
    }

    NSMutableArray *matches = [NSMutableArray array];
    CollectEditableTextAreas(
        (__bridge AXUIElementRef)focusedWindow,
        0,
        30,
        matches
    );
    if (matches.count != 1) {
        CFRelease(application);
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one enabled editable text area; found %lu.",
                (unsigned long)matches.count]
        );
    }

    AXUIElementRef input = (__bridge AXUIElementRef)matches.firstObject;
    id currentValue = CopyAttribute(input, kAXValueAttribute);
    BOOL wasEmpty = [currentValue isKindOfClass:NSString.class]
        && [(NSString *)currentValue length] == 0;
    BOOL cleared = NO;
    if (confirmed) {
        if (!ApplicationIsFrontmost(bundleIdentifier)) {
            CFRelease(application);
            return Fail(
                [NSString stringWithFormat:
                    @"Refusing to clear input because %@ is not frontmost.",
                    bundleIdentifier]
            );
        }
        AXError result = AXUIElementSetAttributeValue(
            input,
            kAXValueAttribute,
            (__bridge CFTypeRef)@""
        );
        if (result != kAXErrorSuccess) {
            CFRelease(application);
            return Fail(
                [NSString stringWithFormat:
                    @"Could not clear the input field (AX error %d).",
                    result]
            );
        }
        cleared = YES;
    }

    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"cleared": @(cleared),
            @"matched": @1,
            @"wasEmpty": @(wasEmpty),
        },
        stdout
    );
    return 0;
}

static BOOL FramesMatch(
    NSDictionary *firstPosition,
    NSDictionary *firstSize,
    NSDictionary *secondPosition,
    NSDictionary *secondSize
) {
    if (firstPosition == nil
        || firstSize == nil
        || secondPosition == nil
        || secondSize == nil) {
        return NO;
    }
    return (
        fabs([firstPosition[@"x"] doubleValue]
            - [secondPosition[@"x"] doubleValue]) < 0.5
        && fabs([firstPosition[@"y"] doubleValue]
            - [secondPosition[@"y"] doubleValue]) < 0.5
        && fabs([firstSize[@"width"] doubleValue]
            - [secondSize[@"width"] doubleValue]) < 0.5
        && fabs([firstSize[@"height"] doubleValue]
            - [secondSize[@"height"] doubleValue]) < 0.5
    );
}

static BOOL HasMatchingChildButton(
    AXUIElementRef element,
    NSString *label,
    NSDictionary *position,
    NSDictionary *size
) {
    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    if (![rawChildren isKindOfClass:NSArray.class]) {
        return NO;
    }
    for (id child in (NSArray *)rawChildren) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        AXUIElementRef childElement = (__bridge AXUIElementRef)child;
        if (![
            StringAttribute(childElement, kAXRoleAttribute)
            isEqualToString:(__bridge NSString *)kAXButtonRole
        ]) {
            continue;
        }
        if (![(ControlLabel(childElement) ?: @"") isEqualToString:label]) {
            continue;
        }
        if (FramesMatch(
            position,
            size,
            PointAttribute(childElement, kAXPositionAttribute),
            SizeAttribute(childElement, kAXSizeAttribute)
        )) {
            return YES;
        }
    }
    return NO;
}

static void CollectRepeatedRowButtons(
    AXUIElementRef element,
    NSUInteger depth,
    NSMutableArray<NSDictionary *> *candidates
) {
    if (depth > 30 || candidates.count >= 100) {
        return;
    }
    NSString *role = StringAttribute(element, kAXRoleAttribute);
    NSString *title = StringAttribute(element, kAXTitleAttribute);
    id enabled = CopyAttribute(element, kAXEnabledAttribute);
    NSDictionary *position = PointAttribute(element, kAXPositionAttribute);
    NSDictionary *size = SizeAttribute(element, kAXSizeAttribute);
    double width = [size[@"width"] doubleValue];
    double height = [size[@"height"] doubleValue];
    if ([role isEqualToString:(__bridge NSString *)kAXButtonRole]
        && title.length > 0
        && [enabled isKindOfClass:NSNumber.class]
        && [enabled boolValue]
        && width > 0
        && height > 0
        && HasMatchingChildButton(element, title, position, size)) {
        NSString *groupKey = [NSString stringWithFormat:
            @"%.0f|%.0f|%.0f",
            [position[@"x"] doubleValue],
            width,
            height
        ];
        [candidates addObject:@{
            @"element": (__bridge id)element,
            @"groupKey": groupKey,
            @"position": position,
            @"size": size,
        }];
    }

    id rawChildren = CopyAttribute(element, kAXChildrenAttribute);
    if (![rawChildren isKindOfClass:NSArray.class]) {
        return;
    }
    for (id child in (NSArray *)rawChildren) {
        if (CFGetTypeID((__bridge CFTypeRef)child) != AXUIElementGetTypeID()) {
            continue;
        }
        CollectRepeatedRowButtons(
            (__bridge AXUIElementRef)child,
            depth + 1,
            candidates
        );
    }
}

static int PressPreviousChat(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }
    NSString *bundleIdentifier = nil;
    BOOL confirmed = NO;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--confirm"]) {
            confirmed = YES;
            index += 1;
        } else {
            return Fail(
                [NSString stringWithFormat:
                    @"Unknown previous-chat argument: %@", argument]
            );
        }
    }
    if (bundleIdentifier.length == 0) {
        return Fail(@"previous-chat requires --bundle-id.");
    }
    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }
    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    NSMutableArray<NSDictionary *> *candidates = [NSMutableArray array];
    id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
    if ([rawWindows isKindOfClass:NSArray.class]) {
        for (id window in (NSArray *)rawWindows) {
            if (CFGetTypeID((__bridge CFTypeRef)window)
                == AXUIElementGetTypeID()) {
                CollectRepeatedRowButtons(
                    (__bridge AXUIElementRef)window,
                    0,
                    candidates
                );
            }
        }
    }

    NSMutableDictionary<NSString *, NSMutableArray<NSDictionary *> *> *groups =
        [NSMutableDictionary dictionary];
    for (NSDictionary *candidate in candidates) {
        NSString *key = candidate[@"groupKey"];
        if (groups[key] == nil) {
            groups[key] = [NSMutableArray array];
        }
        [groups[key] addObject:candidate];
    }
    NSMutableArray<NSDictionary *> *selectedGroup = nil;
    double selectedX = DBL_MAX;
    for (NSMutableArray<NSDictionary *> *group in groups.allValues) {
        if (group.count < 2) {
            continue;
        }
        double x = [group.firstObject[@"position"][@"x"] doubleValue];
        if (x < selectedX) {
            selectedX = x;
            selectedGroup = group;
        }
    }
    if (selectedGroup == nil) {
        CFRelease(application);
        return Fail(@"Could not resolve a repeated recent-chat row group.");
    }
    [selectedGroup sortUsingComparator:^NSComparisonResult(
        NSDictionary *first,
        NSDictionary *second
    ) {
        double firstY = [first[@"position"][@"y"] doubleValue];
        double secondY = [second[@"position"][@"y"] doubleValue];
        if (firstY < secondY) return NSOrderedAscending;
        if (firstY > secondY) return NSOrderedDescending;
        return NSOrderedSame;
    }];
    NSDictionary *target = selectedGroup[1];
    BOOL pressed = NO;
    if (confirmed) {
        if (!ApplicationIsFrontmost(bundleIdentifier)) {
            CFRelease(application);
            return Fail(@"Refusing to switch chat because Codex is not frontmost.");
        }
        pressed = ClickElementCenter(
            (__bridge AXUIElementRef)target[@"element"]
        );
        if (!pressed) {
            CFRelease(application);
            return Fail(@"Previous chat row has an invalid click frame.");
        }
    }
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"candidateCount": @(selectedGroup.count),
            @"pressed": @(pressed),
            @"selectedIndex": @1,
        },
        stdout
    );
    CFRelease(application);
    return 0;
}

static int ActivateApplication(NSArray<NSString *> *arguments) {
    NSString *bundleIdentifier = nil;
    BOOL confirmed = NO;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--confirm"]) {
            confirmed = YES;
            index += 1;
        } else {
            return Fail(
                [NSString stringWithFormat:
                    @"Unknown activate argument: %@", argument]
            );
        }
    }
    if (bundleIdentifier.length == 0) {
        return Fail(@"activate requires --bundle-id.");
    }

    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count > 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected at most one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }
    NSURL *applicationURL = [
        NSWorkspace.sharedWorkspace
        URLForApplicationWithBundleIdentifier:bundleIdentifier
    ];
    if (applicationURL == nil) {
        return Fail(
            [NSString stringWithFormat:
                @"No installed application found for %@.", bundleIdentifier]
        );
    }

    BOOL activated = NO;
    BOOL launched = NO;
    if (confirmed && applications.count == 1) {
        activated = [
            applications.firstObject
            activateWithOptions:NSApplicationActivateAllWindows
        ];
    } else if (confirmed) {
        __block NSRunningApplication *launchedApplication = nil;
        __block NSError *launchError = nil;
        __block BOOL launchFinished = NO;
        NSWorkspaceOpenConfiguration *configuration =
            [NSWorkspaceOpenConfiguration configuration];
        configuration.activates = YES;
        [
            NSWorkspace.sharedWorkspace
            openApplicationAtURL:applicationURL
            configuration:configuration
            completionHandler:^(
                NSRunningApplication *application,
                NSError *error
            ) {
                launchedApplication = application;
                launchError = error;
                launchFinished = YES;
            }
        ];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:8.0];
        while (!launchFinished && deadline.timeIntervalSinceNow > 0) {
            [NSRunLoop.currentRunLoop
                runMode:NSDefaultRunLoopMode
                beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        if (!launchFinished) {
            return Fail(@"Timed out while launching the application.");
        }
        if (launchError != nil || launchedApplication == nil) {
            return Fail(
                launchError.localizedDescription
                ?: @"macOS did not launch the application."
            );
        }
        launched = YES;
        activated = launchedApplication.active;
    }

    WriteJSON(
        @{
            @"activated": @(activated),
            @"bundleIdentifier": bundleIdentifier,
            @"installed": @YES,
            @"launched": @(launched),
            @"running": @(applications.count == 1 || launched),
        },
        stdout
    );
    return 0;
}

static void WriteFrontmostState(
    NSString *targetBundleIdentifier,
    NSRunningApplication *application
) {
    NSString *activeBundleIdentifier = application.bundleIdentifier;
    WriteJSON(
        @{
            @"bundleIdentifier":
                activeBundleIdentifier ?: NSNull.null,
            @"targetFrontmost": @(
                [activeBundleIdentifier isEqualToString:targetBundleIdentifier]
            ),
        },
        stdout
    );
    fflush(stdout);
}

static int WatchFrontmost(NSArray<NSString *> *arguments) {
    if (arguments.count != 2
        || ![arguments[0] isEqualToString:@"--bundle-id"]
        || arguments[1].length == 0) {
        return Fail(@"watch-frontmost requires exactly --bundle-id ID.");
    }
    NSString *bundleIdentifier = arguments[1];
    NSNotificationCenter *notificationCenter =
        NSWorkspace.sharedWorkspace.notificationCenter;
    WriteFrontmostState(
        bundleIdentifier,
        NSWorkspace.sharedWorkspace.frontmostApplication
    );
    id observer = [
        notificationCenter
        addObserverForName:NSWorkspaceDidActivateApplicationNotification
        object:nil
        queue:NSOperationQueue.mainQueue
        usingBlock:^(NSNotification *notification) {
            NSRunningApplication *application =
                notification.userInfo[NSWorkspaceApplicationKey];
            WriteFrontmostState(bundleIdentifier, application);
        }
    ];
    [NSRunLoop.currentRunLoop run];
    [notificationCenter removeObserver:observer];
    return 0;
}

static int PressControl(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }

    NSString *bundleIdentifier = nil;
    NSString *label = nil;
    NSString *roleName = @"button";
    NSString *method = @"ax";
    BOOL confirmed = NO;
    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--bundle-id"]) {
            bundleIdentifier = ValueAfter(arguments, index);
            if (bundleIdentifier == nil) {
                return Fail(@"--bundle-id requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--label"]) {
            label = ValueAfter(arguments, index);
            if (label == nil) {
                return Fail(@"--label requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--role"]) {
            roleName = ValueAfter(arguments, index);
            if (roleName == nil) {
                return Fail(@"--role requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--method"]) {
            method = ValueAfter(arguments, index);
            if (method == nil) {
                return Fail(@"--method requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--confirm"]) {
            confirmed = YES;
            index += 1;
        } else {
            return Fail(
                [NSString stringWithFormat:@"Unknown press argument: %@", argument]
            );
        }
    }

    if (bundleIdentifier.length == 0 || label.length == 0) {
        return Fail(@"press requires --bundle-id and --label.");
    }
    if (![method isEqualToString:@"ax"]
        && ![method isEqualToString:@"mouse"]
        && ![method isEqualToString:@"pick"]) {
        return Fail(@"--method must be ax, mouse, or pick.");
    }
    NSString *requiredRole = AccessibilityRole(roleName);
    if (requiredRole == nil) {
        return Fail(@"--role must be button, menu-item, or pop-up-button.");
    }

    NSArray<NSRunningApplication *> *applications =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier];
    if (applications.count != 1) {
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one running %@ application; found %lu.",
                bundleIdentifier,
                (unsigned long)applications.count]
        );
    }
    AXUIElementRef application = AXUIElementCreateApplication(
        applications.firstObject.processIdentifier
    );
    NSMutableArray *roots = [NSMutableArray array];
    if ([roleName isEqualToString:@"menu-item"]) {
        [roots addObject:(__bridge id)application];
    } else {
        id rawWindows = CopyAttribute(application, kAXWindowsAttribute);
        if ([rawWindows isKindOfClass:NSArray.class]) {
            [roots addObjectsFromArray:rawWindows];
        }
    }

    NSMutableArray *matches = [NSMutableArray array];
    for (id root in roots) {
        CollectExactMatches(
            (__bridge AXUIElementRef)root,
            requiredRole,
            label,
            0,
            30,
            matches
        );
        if (matches.count > 1) {
            break;
        }
    }

    if (matches.count != 1) {
        CFRelease(application);
        return Fail(
            [NSString stringWithFormat:
                @"Expected exactly one enabled %@ named \"%@\"; found %lu.",
                roleName,
                label,
                (unsigned long)matches.count]
        );
    }

    AXUIElementRef matchedElement =
        (__bridge AXUIElementRef)matches.firstObject;
    NSArray<NSString *> *actions = ActionNames(matchedElement);
    NSDictionary *position = PointAttribute(
        matchedElement,
        kAXPositionAttribute
    );
    NSDictionary *size = SizeAttribute(matchedElement, kAXSizeAttribute);
    id focused = CopyAttribute(matchedElement, kAXFocusedAttribute);
    NSString *menuCommandCharacter =
        StringAttribute(matchedElement, kAXMenuItemCmdCharAttribute);
    id menuCommandModifiers =
        CopyAttribute(matchedElement, kAXMenuItemCmdModifiersAttribute);
    BOOL pressed = NO;
    if (confirmed) {
        if (!ApplicationIsFrontmost(bundleIdentifier)) {
            CFRelease(application);
            return Fail(
                [NSString stringWithFormat:
                    @"Refusing to press \"%@\" because %@ is not frontmost.",
                    label, bundleIdentifier]
            );
        }
        if ([method isEqualToString:@"ax"]) {
            AXError result = AXUIElementPerformAction(
                matchedElement,
                kAXPressAction
            );
            if (result != kAXErrorSuccess) {
                CFRelease(application);
                return Fail(
                    [NSString stringWithFormat:
                        @"AXPress failed for \"%@\" with error %d.",
                        label,
                        result]
                );
            }
        } else if ([method isEqualToString:@"pick"]) {
            AXError result = AXUIElementPerformAction(
                matchedElement,
                kAXPickAction
            );
            if (result != kAXErrorSuccess) {
                CFRelease(application);
                return Fail(
                    [NSString stringWithFormat:
                        @"AXPick failed for \"%@\" with error %d.",
                        label,
                        result]
                );
            }
        } else {
            if (!ClickElementCenter(matchedElement)) {
                CFRelease(application);
                return Fail(@"Matched control has an invalid click frame.");
            }
        }
        pressed = YES;
    }
    CFRelease(application);
    WriteJSON(
        @{
            @"bundleIdentifier": bundleIdentifier,
            @"role": roleName,
            @"label": label,
            @"matched": @1,
            @"pressed": @(pressed),
            @"method": method,
            @"menuCommandCharacter":
                menuCommandCharacter ?: NSNull.null,
            @"menuCommandModifiers":
                [menuCommandModifiers isKindOfClass:NSNumber.class]
                    ? menuCommandModifiers
                    : NSNull.null,
            @"actions": actions,
            @"position": position ?: NSNull.null,
            @"size": size ?: NSNull.null,
            @"focused":
                [focused isKindOfClass:NSNumber.class] ? focused : NSNull.null,
        },
        stdout
    );
    return 0;
}

static int SendKey(NSArray<NSString *> *arguments) {
    if (!AXIsProcessTrusted()) {
        return Fail(@"Accessibility permission is not granted to macos-control.");
    }

    NSString *keyName = nil;
    NSString *modifierNames = @"";
    NSInteger holdMilliseconds = 20;
    BOOL confirmed = NO;

    for (NSUInteger index = 0; index < arguments.count;) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--key"]) {
            keyName = ValueAfter(arguments, index);
            if (keyName == nil) {
                return Fail(@"--key requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--modifiers"]) {
            modifierNames = ValueAfter(arguments, index);
            if (modifierNames == nil) {
                return Fail(@"--modifiers requires a value.");
            }
            index += 2;
        } else if ([argument isEqualToString:@"--hold-ms"]) {
            NSString *value = ValueAfter(arguments, index);
            NSScanner *scanner = [NSScanner scannerWithString:value ?: @""];
            NSInteger parsed = 0;
            if (![scanner scanInteger:&parsed]
                || !scanner.isAtEnd
                || parsed < 0
                || parsed > 5000) {
                return Fail(@"--hold-ms must be an integer from 0 to 5000.");
            }
            holdMilliseconds = parsed;
            index += 2;
        } else if ([argument isEqualToString:@"--confirm"]) {
            confirmed = YES;
            index += 1;
        } else {
            return Fail(
                [NSString stringWithFormat:@"Unknown key argument: %@", argument]
            );
        }
    }

    NSNumber *keyCode = KeyCodes()[keyName.lowercaseString ?: @""];
    if (keyCode == nil) {
        return Fail(@"Missing or unsupported --key value.");
    }

    CGEventFlags flags = 0;
    NSString *modifierError = nil;
    if (!ParseModifiers(modifierNames, &flags, &modifierError)) {
        return Fail(modifierError);
    }

    CGEventRef down = CGEventCreateKeyboardEvent(
        nil,
        (CGKeyCode)keyCode.unsignedShortValue,
        true
    );
    CGEventRef up = CGEventCreateKeyboardEvent(
        nil,
        (CGKeyCode)keyCode.unsignedShortValue,
        false
    );
    if (down == nil || up == nil) {
        if (down != nil) CFRelease(down);
        if (up != nil) CFRelease(up);
        return Fail(@"macOS did not create the requested keyboard event.");
    }

    CGEventSetFlags(down, flags);
    CGEventSetFlags(up, flags);
    if (confirmed) {
        CGEventPost(kCGHIDEventTap, down);
        [NSThread sleepForTimeInterval:(double)holdMilliseconds / 1000.0];
        CGEventPost(kCGHIDEventTap, up);
    }
    CFRelease(down);
    CFRelease(up);
    WriteJSON(
        @{
            @"key": keyName.lowercaseString,
            @"modifiers": modifierNames.lowercaseString,
            @"sent": @(confirmed),
        },
        stdout
    );
    return 0;
}

static void WriteUsage(void) {
    const char *usage =
        "macos-control\n\n"
        "Usage:\n"
        "  macos-control status\n"
        "  macos-control controls --bundle-id ID [--max-depth 20]\n"
        "  macos-control watch-controls --bundle-id ID [--duration-ms 15000] "
            "[--open-popup-label EXACT]\n"
        "  macos-control outline --bundle-id ID\n"
        "  macos-control activate --bundle-id ID [--confirm]\n"
        "  macos-control watch-frontmost --bundle-id ID\n"
        "  macos-control previous-chat --bundle-id ID [--confirm]\n"
        "  macos-control clear-input --bundle-id ID [--confirm]\n"
        "  macos-control match --bundle-id ID --role ROLE --label EXACT\n"
        "  macos-control press --bundle-id ID "
            "--role button|menu-item|pop-up-button "
            "--label EXACT [--method ax|mouse|pick] [--confirm]\n"
        "  macos-control key --key NAME [--modifiers cmd,shift] "
            "[--hold-ms 20] [--confirm]\n\n"
        "`status` is read-only and never opens the Accessibility permission prompt.\n"
        "`controls` lists interactive Accessibility elements, not document text.\n"
        "`key` refuses to run unless Accessibility permission is already granted.\n";
    fwrite(usage, 1, strlen(usage), stdout);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSMutableArray<NSString *> *arguments = [NSMutableArray array];
        for (int index = 1; index < argc; index += 1) {
            [arguments addObject:[NSString stringWithUTF8String:argv[index]]];
        }

        NSString *command = arguments.firstObject;
        if (command == nil
            || [command isEqualToString:@"help"]
            || [command isEqualToString:@"--help"]
            || [command isEqualToString:@"-h"]) {
            WriteUsage();
            return 0;
        }
        if ([command isEqualToString:@"status"]) {
            return WriteStatus();
        }
        if ([command isEqualToString:@"controls"]) {
            return ListControls(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"watch-controls"]) {
            return WatchControls(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"outline"]) {
            return WriteOutline(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"match"]) {
            return MatchControl(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"activate"]) {
            return ActivateApplication(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"watch-frontmost"]) {
            return WatchFrontmost(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"previous-chat"]) {
            return PressPreviousChat(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"clear-input"]) {
            return ClearInput(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"press"]) {
            return PressControl(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        if ([command isEqualToString:@"key"]) {
            return SendKey(
                [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)]
            );
        }
        return Fail(
            [NSString stringWithFormat:@"Unknown command: %@", command]
        );
    }
}
