import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteVinculacionDto {
  // 1. Datos Generales
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  firstLastName: string;

  @IsString()
  @IsOptional()
  secondLastName?: string;

  @IsString()
  @IsNotEmpty()
  document: string;

  @IsString()
  @IsOptional()
  idType?: string;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsNotEmpty()
  docIssueDate: string;

  @IsString()
  @IsNotEmpty()
  docIssuePlace: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsNotEmpty()
  miningMunicipality: string;

  @IsString()
  @IsNotEmpty()
  miningDepartment: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  ciiuCode: string;

  @IsString()
  @IsOptional()
  ciiuDescription?: string;

  @IsBoolean()
  @IsOptional()
  declaresRent?: boolean;

  // 2. Información Financiera
  @IsNumber()
  @Type(() => Number)
  monthlyIncome: number;

  @IsString()
  @IsOptional()
  incomeConcept?: string;

  @IsNumber()
  @Type(() => Number)
  monthlyExpenses: number;

  @IsString()
  @IsOptional()
  expenseConcept?: string;

  // 3. Personas Expuestas Políticamente (PEP)
  @IsBoolean()
  @IsOptional()
  isPep?: boolean;

  @IsString()
  @IsOptional()
  pepPosition?: string;

  @IsString()
  @IsOptional()
  pepStartDate?: string;

  @IsString()
  @IsOptional()
  pepEndDate?: string;

  @IsBoolean()
  @IsOptional()
  isOrgRep?: boolean;

  @IsString()
  @IsOptional()
  orgName?: string;

  @IsBoolean()
  @IsOptional()
  hasPepSpouse?: boolean;

  @IsString()
  @IsOptional()
  pepSpouseName?: string;

  @IsString()
  @IsOptional()
  pepSpouseRelationship?: string;

  @IsString()
  @IsOptional()
  pepSpousePosition?: string;

  // 4. Origen de Fondos
  @IsString()
  @IsOptional()
  fundsOriginActivities?: string;

  // 5. Referencias
  // 5.1 Bancaria
  @IsBoolean()
  @IsOptional()
  hasBankAccount?: boolean;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankBranch?: string;

  @IsString()
  @IsOptional()
  bankCity?: string;

  @IsString()
  @IsOptional()
  bankAccountNumber?: string;

  @IsString()
  @IsOptional()
  bankAccountType?: string;

  @IsString()
  @IsOptional()
  bankAccountYears?: string;

  // 5.2 Personal
  @IsString()
  @IsOptional()
  refPersonalName?: string;

  @IsString()
  @IsOptional()
  refPersonalRelationship?: string;

  @IsString()
  @IsOptional()
  refPersonalAddress?: string;

  @IsString()
  @IsOptional()
  refPersonalPhone?: string;

  // 6. Diligenciamiento
  @IsString()
  @IsOptional()
  fillCity?: string;

  @IsString()
  @IsOptional()
  fillDate?: string;
}
