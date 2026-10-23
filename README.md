# timeplace

Parse and format **timeplace** lines: a single line of text naming a time, a place, and a comment.

```
2025-05-18 5:30pm Arnett, OK # Several tornadoes
2022-12-02 05z 40.01499,-105.27055 # Downslope windstorm, 50-80mph
```

The format is defined in [SPEC.md](SPEC.md). Two implementations live in this repository:

| Directory | Package | Registry | Docs |
| --- | --- | --- | --- |
| [python/](python/) | `timeplace` | PyPI | [python/README.md](python/README.md) |
| [js/](js/) | `timeplace` | npm | [js/README.md](js/README.md) |

Releases are tagged `py-v*` (PyPI) and `js-v*` (npm).
