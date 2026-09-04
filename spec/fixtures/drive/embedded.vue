<script setup lang="ts">
const personCard = graphql`
  query EmbeddedPerson($id: ID!) {
    person(id: $id) {
      name
      unknownEmbeddedField
    }
  }
`;
</script>

<template>
  <section>{{ personCard }}</section>
</template>
