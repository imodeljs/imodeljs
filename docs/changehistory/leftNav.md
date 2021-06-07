## Change History

---

### Roadmap

- [Big Picture](./Roadmap.md)

---

### Versions
- [2.16.0](./2.16.0.md)

- [2.15.0](./2.15.0.md)

- [2.14.0](./2.14.0.md)

- [2.13.0](./2.13.0.md)

- [2.12.0](./2.12.0.md)


- [2.11.0](./2.11.0.md)

- [2.10.0](./2.10.0.md)

- [2.9.0](./2.9.0.md)

- [2.8.0](./2.8.0.md)

- [2.7.0](./2.7.0.md)

- [2.6.0](./2.6.0.md)

- [2.5.0](./2.5.0.md)

- [2.4.0](./2.4.0.md)

- [2.3.0](./2.3.0.md)

- [2.2.0](./2.2.0.md)

- [2.1.0](./2.1.0.md)

- [2.0.0](./2.0.0.md)

&nbsp;
&nbsp;

### Previous Versions

- [1.14.0](./1.14.0.md)

- [1.13.0](./1.13.0.md)

- [1.12.0](./1.12.0.md)

- [1.11.0](./1.11.0.md)

- [1.10.0](./1.10.0.md)

- [1.9.0](./1.9.0.md)

- [1.8.0](./1.8.0.md)

- [1.7.0](./1.7.0.md)

- [1.6.0](./1.6.0.md)

- [1.5.0](./1.5.0.md)

- [1.4.0](./1.4.0.md)

- [1.3.0](./1.3.0.md)

- [1.2.0](./1.2.0.md)

- [1.1.0](./1.1.0.md)

- [1.0.0](./1.0.0.md)

---

### [Change Logs](./ChangeLogs.md)

- [imodeljs-backend](../reference/imodeljs-backend/changelog)

- [imodeljs-frontend](../reference/imodeljs-frontend/changelog)

- [imodeljs-common](../reference/imodeljs-common/changelog)

- [geometry-core](../reference/geometry-core/changelog)

- [bentleyjs-core](../reference/bentleyjs-core/changelog)

<script>
    $("[id='previous versions']").next("ul").hide();

    $(document).ready(function () {
        if (!window.document.URL.includes("changehistory/1.")) {
              $("[id='previous versions'] i").addClass('icon-chevron-down').removeClass('icon-chevron-up');
        } else {
               $("[id='previous versions'] i").addClass('icon-chevron-up').removeClass('icon-chevron-down');
               $("[id='previous versions']").next("ul").show();
        }
    });
</script>
