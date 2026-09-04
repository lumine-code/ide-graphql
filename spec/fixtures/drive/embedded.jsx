const graphql = String.raw;
const personCard = graphql`
  query EmbeddedPerson($id: ID!) {
    person(id: $id) {
      name
      unknownEmbeddedField
    }
  }
`;

module.exports = personCard;
