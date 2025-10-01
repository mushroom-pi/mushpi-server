import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

// Custom decorator to validate that a string is either 'all', 'none', or a comma-separated list of valid values
export function IsAllNoneOrCommaSeparatedEnum(
  validValues: string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllNoneOrCommaSeparatedEnum',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }

          const values = value.split(',').map((val) => val.trim());
          if (values.length === 1) {
            return ['all', 'none', ...validValues].includes(values[0]);
          }

          return values.every((val) => validValues.includes(val));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be 'all', 'none', or a comma-separated list of valid values: ${validValues.join(
            ', ',
          )}`;
        },
      },
    });
  };
}
