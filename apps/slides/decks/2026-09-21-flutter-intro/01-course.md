---
layout: section-divider
accent: indigo
kicker: "Intro to Flutter"
docsPage:
  file: setup
  title: Get Set Up
  description: Meet Flutter, clone the workshop repo, and run the starter app on an emulator.
---

# Get Set Up

> [!NOTE]
> Adapted by Sloan Finger from Nandan Praveen's Flutter workshop with GDGC, Sep 21, 2026.

---
accent: indigo
---

# What You'll Build

- A two-tab app: a home screen, and a guestbook visitors can sign
- A bar along the bottom to switch between them

> [!IMPORTANT]
> Install Git, VS Code, the Flutter SDK and an Android emulator first: the [Prerequisites](/docs/workshops/getting-started/prerequisites#for-the-flutter-track) cover all of them.

---
layout: bullets-card
accent: indigo
cardTitle: Why Flutter?
---

# What Is Flutter?

- Google's open-source, widget-based toolkit for building apps for mobile, web, desktop and embedded devices from one codebase
- Written in Dart, a language that reads a lot like Java
- DogPack, the club's study-group app, is built with it, on a Supabase backend

::card::

- **One codebase.** The same code runs on nearly any platform you'd want an app on.
- **Easy to start.** Flutter is quick to pick up, and has an equally high ceiling.

---
layout: terminal
accent: indigo
heading: Get the Workshop Code
titlebar: Terminal
---

```bash {*}{cwd:'~'}
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Mobile-Workshops
cd Mobile-Workshops
# Your own branch, starting from the course's first step
git switch -c <github-username>/01-flutter-intro 01-flutter-intro/00-start
# Install dependencies
flutter pub get
```

Open the `Mobile-Workshops` folder in VS Code (`code .` from that terminal works too). Every step below ends at a checkpoint, so you can catch up if you fall behind.

> [!TIP]
> If `flutter pub get` says your Dart SDK is too old, run `flutter upgrade`.

<details>
<summary>Where does the starter come from?</summary>

`01-flutter-intro/00-start` is a fresh app from `flutter create workshop_demo`, trimmed down to one screen.

</details>

---
layout: terminal
accent: indigo
heading: Run It
titlebar: Terminal
---

Start your emulator first: in Android Studio, **More Actions → Virtual Device Manager**, then the play button beside your device. `flutter devices` should list it. Then:

```bash {*}{run: false}
# Build the app and start it on the emulator
flutter run
```

The emulator shows "Hello, World!" in teal. Leave `flutter run` going while you work.

> [!IMPORTANT]
> After you save a file, press `r` in the `flutter run` terminal to **hot reload**, which swaps in your change in about a second, keeping the app where it was. `R` is a **hot restart**, which starts the app over.

---
layout: statement
accent: indigo
chip: STEP 1
docsPage:
  file: 01-widgets
  description: Everything on screen is a widget. Meet the key ones, and give the home screen its own file.
---

# Widgets

In Flutter, everything on screen is a widget: text, buttons, padding, whole screens. Widgets nest inside each other to make a tree, and your app is the widget at its root.

---
accent: indigo
---

# Some Key Widgets

| Widget                                 | What it does                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| `Scaffold`                             | The base for every screen you write: app bar, body, bottom bar. |
| `Text`                                 | Shows a string.                                             |
| Buttons (`ElevatedButton`, `TextButton`) | Run code when they're tapped.                             |
| `Row`                                  | Arranges its children side by side.                         |
| `Column`                               | Stacks its children top to bottom.                          |
| `Card`                                 | A raised panel, for grouping content into clean layers.     |

---
layout: terminal
checkpoint: 01-flutter-intro/01-widgets
accent: indigo
heading: The Home Screen, in Its Own File
titlebar: Editor
file: ~/lib/homepage.dart
---

<<< mobile@01-flutter-intro/01-widgets:lib/homepage.dart {1-8|10-22}

<CodeTips>
<template #0>

Make `lib/homepage.dart` for the home screen, so `main.dart` doesn't grow with every screen you add. It comes in two parts here: put them one after the other. `HomePage` is a `StatefulWidget`: the widget itself is small, and `createState` hands it a `State` object to keep.

</template>
<template #1>

The `State` holds anything that can change, and has the `build` method, which returns the widgets to draw: a `Scaffold`, with the text centered in its body. Nothing changes on this screen yet. The guestbook in step 3 is where state earns its keep.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-flutter-intro/01-widgets
accent: indigo
heading: Import It in main.dart
titlebar: Editor
file: ~/lib/main.dart
---

<<< mobile@01-flutter-intro/01-widgets:lib/main.dart {build:1-3}

<CodeTips>
<template #0>

`main()` runs the app. `MyApp` sets its title and theme, and `home` is the first screen. Delete the old `HomePage` class from the bottom of this file, and add the import of the new one as the first line.

<details>
<summary>What is <code>package:flutter_workshop/</code>?</summary>

This app's own `lib` folder: `flutter_workshop` is the name in `pubspec.yaml`.

</details>

</template>
</CodeTips>

---
layout: bullets-card
accent: indigo
cardTitle: "Stateful: it keeps state"
---

# Stateless or Stateful

**Stateless**, like `MyApp`:

- Draws from its inputs alone
- Draws the same thing until its parent hands it something new

::card::

- Keeps a `State` object between draws
- Calling `setState` changes it, and Flutter calls `build` again to redraw

---
accent: indigo
---

# Your Turn: Try Some Widgets

In `homepage.dart`, wrap the `Text` in a `Column`, add a second `Text` under it, and put the whole thing in a `Card`. Save, and press `r` in the terminal running the app: the change appears without restarting.

> [!WARNING]
> This one's for practice, with no checkpoint. Undo it before step 2 (**Ctrl+Z**, or **Cmd+Z** on macOS, in the editor), so your code matches ours.

---
layout: statement
accent: indigo
chip: STEP 2
docsPage:
  file: 02-navigation
  description: Add a bar along the bottom that switches between two screens.
---

# Navigation

Most apps have more than one screen. This step adds a bar along the bottom with two tabs: Home, and a Guestbook tab you'll fill in during step 3.

---
layout: terminal
checkpoint: 01-flutter-intro/02-navigation
accent: indigo
heading: A Shell for the Tabs
titlebar: Editor
file: ~/lib/shell.dart
---

<<< mobile@01-flutter-intro/02-navigation:lib/shell.dart {1-12|14-17|19-33}

<CodeTips>
<template #0>

Make `lib/shell.dart`. `Shell` holds the app's screens and switches between them. It's Stateful, because which tab is selected changes.

</template>
<template #1>

`_selectedIndex` is the selected tab. `_pages` has a screen for each tab: `HomePage`, then a placeholder `Text` until the guestbook exists.

</template>
<template #2>

`Scaffold` has a slot for a bar along the bottom. `NavigationBar` shows one `NavigationDestination` per tab. Tapping one calls `onDestinationSelected`, and `setState` stores the new index, so `build` runs again and the body shows that tab's page.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-flutter-intro/02-navigation
accent: indigo
heading: Open on the Shell
titlebar: Editor
file: ~/lib/main.dart
---

<<< mobile@01-flutter-intro/02-navigation:lib/main.dart {build:1,2}

<CodeTips>
<template #0>

`home` becomes `Shell()`, so the app opens on the tabs.

</template>
</CodeTips>

---
accent: indigo
---

# Try It

Press `R` in the terminal running the app for a hot restart, since the first screen changed. Tap between Home and Guestbook.

---
layout: statement
accent: indigo
chip: STEP 3
docsPage:
  file: 03-guestbook
  description: Fill the second tab with a guestbook. Text fields, a list, and state that changes.
---

# Guestbook

A guestbook uses everything so far: a Stateful widget, a `Scaffold`, and the tab from step 2. This time the state is a list that grows.

---
layout: terminal
checkpoint: 01-flutter-intro/03-guestbook
accent: indigo
heading: The Guestbook Screen
titlebar: Editor
file: ~/lib/guestbook.dart
---

<<< mobile@01-flutter-intro/03-guestbook:lib/guestbook.dart {1-10|15-35|37-54|56-94|96-101}

<CodeTips>
<template #0>

> [!TIP]
> The file is long, so it comes in five parts: put them one after another, in order, or copy the whole file from the link after the last part.

Make `lib/guestbook.dart`. `GuestbookEntry` is plain Dart: one entry's name, message and time. `required` means every entry has all three.

</template>
<template #1>

`Guestbook` is Stateful. Its `State` keeps a `TextEditingController` per field, which reads and clears what's typed, and the list of entries. Controllers hold on to resources, so `dispose` releases them when the screen goes away.

</template>
<template #2>

`_submit` trims both fields and turns away an entry with an empty one. Inside `setState`, the new entry goes in at index 0, so the newest shows first, and the fields clear. `setState` is what tells Flutter to rebuild with the new list.

</template>
<template #3>

The screen is a `Column`: two `TextField`s, a button that calls `_submit`, and the list. `ListView.builder` only builds the rows on screen, which matters once a list gets long. `Expanded` gives it whatever height the column has left.

</template>
<template #4>

`_formatTime` turns a time into `HH:MM` for each entry.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-flutter-intro/03-guestbook
accent: indigo
heading: Put It in the Tab
titlebar: Editor
file: ~/lib/shell.dart
---

<<< mobile@01-flutter-intro/03-guestbook:lib/shell.dart {build:1,2}

<CodeTips>
<template #0>

The placeholder becomes the real `Guestbook`, imported at the top.

</template>
</CodeTips>

---
accent: indigo
---

# Restart It

Hot reload, open the Guestbook tab, and sign it a few times. Then press `R` for a hot restart. The entries are gone: they only ever lived in the screen's state, in memory.

> [!NOTE]
> The [Supabase workshop](/docs/workshops/supabase/flutter/setup) gives them somewhere to live, starting from exactly this code.

---
layout: numbered-list
accent: indigo
---

# Keep Going

- [Flutter's docs](https://docs.flutter.dev), from first app to publishing
- [The widget catalog](https://docs.flutter.dev/ui/widgets), every built-in widget by category
- [A tour of Dart](https://dart.dev/language), the language under it all
- Ready to contribute? Start with DogPack's [Your first contribution](/docs/study-group-finder/getting-started/first-contribution)
